import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { ADDITIVE_INDEXES, DATABASE_FILENAME, SCHEMA } from './schema.js';

export { DATABASE_FILENAME };

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
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
  migrateChatSessions(db);
  ensureColumn(db, 'chat_sessions', 'grade_score', 'INTEGER');
  ensureColumn(db, 'chat_sessions', 'grade_comment', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'grade_transcript', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'grade_analysis', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'graded_at', 'TEXT');
  ensureColumn(db, 'chat_sessions', 'title_source', "TEXT NOT NULL DEFAULT 'default'");
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
