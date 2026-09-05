import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { ADDITIVE_INDEXES, DATABASE_FILENAME, SCHEMA } from './schema.js';

export { DATABASE_FILENAME };

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (col) => col.name,
  );
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (!columnNames(db, table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function renameColumnIfPresent(
  db: Database.Database,
  table: string,
  from: string,
  to: string,
): void {
  const cols = columnNames(db, table);
  if (cols.includes(from) && !cols.includes(to)) {
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
  }
}

function migrateAgentTasks(db: Database.Database): void {
  if (tableExists(db, 'session_profiles') && !tableExists(db, 'agent_tasks')) {
    db.exec('ALTER TABLE session_profiles RENAME TO agent_tasks');
  }
  if (!tableExists(db, 'agent_tasks')) return;

  ensureColumn(db, 'agent_tasks', 'purpose', "TEXT NOT NULL DEFAULT ''");
  db.prepare(`DELETE FROM agent_tasks WHERE name = 'from-goal' AND built_in = 1`).run();
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_tasks_name ON agent_tasks(name)');
}

function migrateChatSessions(db: Database.Database): void {
  ensureColumn(db, 'agents', 'active_session_id', 'TEXT');
  ensureColumn(db, 'messages', 'session_id', 'TEXT');

  const agents = db.prepare('SELECT * FROM agents').all() as Array<Record<string, unknown>>;
  const sessionCount = db.prepare('SELECT COUNT(*) AS n FROM chat_sessions WHERE agent_id = ?');
  const insertSession = db.prepare(
    `INSERT INTO chat_sessions (
       id, agent_id, title, template, status, model, effort, permission_mode,
       claude_session_id, pid, run_log_path, created_at, updated_at
     ) VALUES (
       @id, @agentId, @title, @template, @status, @model, @effort, @permissionMode,
       @claudeSessionId, @pid, @runLogPath, @createdAt, @updatedAt
     )`,
  );
  const setActive = db.prepare('UPDATE agents SET active_session_id = ? WHERE id = ?');
  const backfillMessages = db.prepare(
    `UPDATE messages SET session_id = ?
     WHERE agent_id = ? AND (session_id IS NULL OR session_id = '')`,
  );

  for (const agent of agents) {
    const agentId = String(agent.id);
    const existing = sessionCount.get(agentId) as { n: number };
    if (existing.n > 0) {
      const activeId =
        agent.active_session_id == null ? null : String(agent.active_session_id);
      if (activeId) backfillMessages.run(activeId, agentId);
      continue;
    }

    const sessionId = crypto.randomUUID();
    const createdAt = String(agent.created_at ?? new Date().toISOString());
    const updatedAt = String(agent.updated_at ?? createdAt);
    insertSession.run({
      id: sessionId,
      agentId,
      title: 'Chat',
      template: 'chat',
      status: String(agent.status ?? 'idle'),
      model: String(agent.model ?? 'sonnet'),
      effort: String(agent.effort ?? 'high'),
      permissionMode: String(agent.permission_mode ?? 'plan'),
      claudeSessionId: agent.claude_session_id == null ? null : String(agent.claude_session_id),
      pid: agent.pid == null ? null : Number(agent.pid),
      runLogPath: agent.run_log_path == null ? null : String(agent.run_log_path),
      createdAt,
      updatedAt,
    });
    setActive.run(sessionId, agentId);
    backfillMessages.run(sessionId, agentId);
  }
}

function migrateSchema(db: Database.Database): void {
  ensureColumn(db, 'agents', 'pid', 'INTEGER');
  ensureColumn(db, 'agents', 'run_log_path', 'TEXT');
  ensureColumn(db, 'agents', 'permission_mode', "TEXT NOT NULL DEFAULT 'plan'");
  ensureColumn(db, 'agents', 'effort', "TEXT NOT NULL DEFAULT 'high'");
  ensureColumn(db, 'agents', 'archived_at', 'TEXT');
  ensureColumn(db, 'messages', 'attachments', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'messages', 'metadata', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'queued_messages', 'mentions', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'queued_messages', 'blocked_reason', 'TEXT');
  migrateChatSessions(db);
  ensureColumn(db, 'chat_sessions', 'grade_score', 'INTEGER');
  ensureColumn(db, 'chat_sessions', 'grade_comment', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'grade_transcript', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'grade_analysis', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'graded_at', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'title_source', "TEXT NOT NULL DEFAULT 'default'");
  if (!columnNames(db, 'chat_sessions').includes('agent_task_id')) {
    ensureColumn(db, 'chat_sessions', 'profile_id', 'TEXT');
    renameColumnIfPresent(db, 'chat_sessions', 'profile_id', 'agent_task_id');
  }
  ensureColumn(db, 'chat_sessions', 'agent_task_id', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'system_prompt', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'allowed_tools', 'TEXT');
  migrateAgentTasks(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_followups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'prompt',
      template TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      built_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_followups_name ON task_followups(name);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      workspace_id TEXT,
      agent_id TEXT,
      kind TEXT NOT NULL DEFAULT 'fact',
      key TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user',
      source_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_memories_scope ON agent_memories(scope, status);
    CREATE INDEX IF NOT EXISTS idx_agent_memories_workspace ON agent_memories(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id, status);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_messages_created ON assistant_messages(created_at);
  `);
}

function backfillSessionSearchIndexTable(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM session_search_index').get() as { n: number };
  if (count.n > 0) return;

  const sessions = db.prepare('SELECT id FROM chat_sessions').all() as Array<{ id: string }>;
  if (sessions.length === 0) return;

  const listMessages = db.prepare(
    `SELECT role, content FROM messages
     WHERE session_id = ?
     ORDER BY created_at ASC, rowid ASC`,
  );
  const getSession = db.prepare(
    'SELECT id, agent_id, title, updated_at FROM chat_sessions WHERE id = ?',
  );
  const upsert = db.prepare(
    `INSERT INTO session_search_index (
       session_id, agent_id, title, first_prompt, last_summary, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       agent_id = excluded.agent_id,
       title = excluded.title,
       first_prompt = excluded.first_prompt,
       last_summary = excluded.last_summary,
       updated_at = excluded.updated_at`,
  );

  for (const { id } of sessions) {
    const session = getSession.get(id) as
      | { id: string; agent_id: string; title: string; updated_at: string }
      | undefined;
    if (!session) continue;
    const messages = listMessages.all(id) as Array<{ role: string; content: string }>;
    const firstUser = messages.find((item) => item.role === 'user');
    const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant');
    const summary = lastAssistant?.content?.trim() ?? '';
    const clipped =
      summary.length > 500
        ? summary.slice(0, 500)
        : summary === '[stopped]' || summary === '[no output]'
          ? ''
          : summary;
    upsert.run(
      session.id,
      session.agent_id,
      session.title,
      firstUser?.content ?? '',
      clipped,
      session.updated_at,
    );
  }
}

function applySchema(db: Database.Database): void {
  db.exec(SCHEMA);
  migrateSchema(db);
  db.exec(ADDITIVE_INDEXES);
}

function sqliteErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return '';
}

function sqliteErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function shouldResetDatabase(err: unknown): boolean {
  const code = sqliteErrorCode(err);
  if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') return true;
  const message = sqliteErrorMessage(err);
  return (
    /no such column/i.test(message) ||
    /no such table/i.test(message) ||
    /file is not a database/i.test(message) ||
    /database disk image is malformed/i.test(message)
  );
}

function databaseSidecars(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`];
}

function resetDatabaseFiles(dbPath: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const file of databaseSidecars(dbPath)) {
    if (!fs.existsSync(file)) continue;
    const dest = `${file}.broken.${stamp}`;
    fs.renameSync(file, dest);
    console.warn(`[db] moved unusable ${path.basename(file)} to ${path.basename(dest)}`);
  }
}

function openAndMigrate(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    applySchema(db);
    backfillSessionSearchIndexTable(db);
    return db;
  } catch (err) {
    try {
      db.close();
    } catch {
      // ignore close errors so the original failure is reported
    }
    throw err;
  }
}

export function initDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, DATABASE_FILENAME);
  try {
    return openAndMigrate(dbPath);
  } catch (err) {
    if (!shouldResetDatabase(err)) throw err;
    console.warn(
      `[db] ${sqliteErrorMessage(err)}; backing up the database and starting over`,
    );
    resetDatabaseFiles(dbPath);
    return openAndMigrate(dbPath);
  }
}
