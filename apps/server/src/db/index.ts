import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type {
  Agent,
  AgentEvent,
  ChatSession,
  ChatSessionTemplateId,
  ChatSessionTitleSource,
  EffortLevel,
  Message,
  MessageAttachment,
  MessageMetadata,
  PermissionMode,
  QueuedChatMessage,
  SessionGrade,
  SessionGradeAnalysis,
  SessionGradeScore,
  Worktree,
  Workspace,
} from '@agent-orchestrator/shared';
import { DEFAULT_EFFORT_LEVEL } from '@agent-orchestrator/shared';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worktrees (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  pr_number INTEGER,
  pr_title TEXT,
  base_branch TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  worktree_id TEXT NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  model TEXT NOT NULL DEFAULT 'sonnet',
  effort TEXT NOT NULL DEFAULT 'high',
  permission_mode TEXT NOT NULL DEFAULT 'plan',
  claude_session_id TEXT,
  pid INTEGER,
  run_log_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  active_session_id TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'idle',
  model TEXT NOT NULL DEFAULT 'sonnet',
  effort TEXT NOT NULL DEFAULT 'high',
  permission_mode TEXT NOT NULL DEFAULT 'plan',
  claude_session_id TEXT,
  pid INTEGER,
  run_log_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  grade_score INTEGER,
  grade_comment TEXT,
  grade_transcript TEXT,
  grade_analysis TEXT,
  graded_at TEXT,
  title_source TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queued_messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worktrees_workspace ON worktrees(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_worktree ON agents(worktree_id);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON chat_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
`;

/** Indexes on columns that older databases may not have until `migrateSchema` runs. */
const ADDITIVE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_queued_messages_session ON queued_messages(session_id);
`;

export const DATABASE_FILENAME = 'agent-orchestrator.db';

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

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class WorkspaceRepository {
  constructor(private db: Database.Database) {}

  create(workspace: Workspace): Workspace {
    this.db
      .prepare(
        `INSERT INTO workspaces (id, name, repo_url, repo_path, default_branch, github_owner, github_repo, created_at)
         VALUES (@id, @name, @repoUrl, @repoPath, @defaultBranch, @githubOwner, @githubRepo, @createdAt)`,
      )
      .run({
        id: workspace.id,
        name: workspace.name,
        repoUrl: workspace.repoUrl,
        repoPath: workspace.repoPath,
        defaultBranch: workspace.defaultBranch,
        githubOwner: workspace.githubOwner,
        githubRepo: workspace.githubRepo,
        createdAt: workspace.createdAt,
      });
    return workspace;
  }

  list(): Workspace[] {
    return this.db
      .prepare('SELECT * FROM workspaces ORDER BY created_at DESC')
      .all()
      .map(rowToWorkspace);
  }

  getById(id: string): Workspace | null {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    return row ? rowToWorkspace(row) : null;
  }

  getByOwnerRepo(owner: string, repo: string): Workspace | null {
    const row = this.db
      .prepare(
        `SELECT * FROM workspaces
         WHERE lower(github_owner) = lower(?) AND lower(github_repo) = lower(?)
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(owner, repo);
    return row ? rowToWorkspace(row) : null;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  }
}

export class WorktreeRepository {
  constructor(private db: Database.Database) {}

  create(worktree: Worktree): Worktree {
    this.db
      .prepare(
        `INSERT INTO worktrees (id, workspace_id, name, path, branch, pr_number, pr_title, base_branch, created_at)
         VALUES (@id, @workspaceId, @name, @path, @branch, @prNumber, @prTitle, @baseBranch, @createdAt)`,
      )
      .run({
        id: worktree.id,
        workspaceId: worktree.workspaceId,
        name: worktree.name,
        path: worktree.path,
        branch: worktree.branch,
        prNumber: worktree.prNumber,
        prTitle: worktree.prTitle,
        baseBranch: worktree.baseBranch,
        createdAt: worktree.createdAt,
      });
    return worktree;
  }

  listByWorkspace(workspaceId: string): Worktree[] {
    return this.db
      .prepare('SELECT * FROM worktrees WHERE workspace_id = ? ORDER BY created_at DESC')
      .all(workspaceId)
      .map(rowToWorktree);
  }

  getById(id: string): Worktree | null {
    const row = this.db.prepare('SELECT * FROM worktrees WHERE id = ?').get(id);
    return row ? rowToWorktree(row) : null;
  }

  getByWorkspaceAndPr(workspaceId: string, prNumber: number): Worktree | null {
    const row = this.db
      .prepare(
        `SELECT * FROM worktrees
         WHERE workspace_id = ? AND pr_number = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(workspaceId, prNumber);
    return row ? rowToWorktree(row) : null;
  }

  update(worktree: Worktree): Worktree {
    this.db
      .prepare(
        `UPDATE worktrees SET name = @name, path = @path, branch = @branch,
         pr_number = @prNumber, pr_title = @prTitle, base_branch = @baseBranch
         WHERE id = @id`,
      )
      .run({
        id: worktree.id,
        name: worktree.name,
        path: worktree.path,
        branch: worktree.branch,
        prNumber: worktree.prNumber,
        prTitle: worktree.prTitle,
        baseBranch: worktree.baseBranch,
      });
    return worktree;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM worktrees WHERE id = ?').run(id);
  }
}

export class AgentRepository {
  constructor(private db: Database.Database) {}

  create(agent: Agent): Agent {
    this.db
      .prepare(
        `INSERT INTO agents (id, worktree_id, name, status, model, effort, permission_mode, claude_session_id, pid, run_log_path, created_at, updated_at, archived_at, active_session_id)
         VALUES (@id, @worktreeId, @name, @status, @model, @effort, @permissionMode, @claudeSessionId, @pid, @runLogPath, @createdAt, @updatedAt, @archivedAt, @activeSessionId)`,
      )
      .run({
        id: agent.id,
        worktreeId: agent.worktreeId,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        effort: agent.effort,
        permissionMode: agent.permissionMode,
        claudeSessionId: agent.claudeSessionId,
        pid: agent.pid,
        runLogPath: agent.runLogPath,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        archivedAt: agent.archivedAt,
        activeSessionId: agent.activeSessionId,
      });
    return agent;
  }

  getById(id: string): Agent | null {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    return row ? rowToAgent(row) : null;
  }

  getByWorktreeId(worktreeId: string): Agent | null {
    const row = this.db
      .prepare(
        `SELECT * FROM agents WHERE worktree_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      )
      .get(worktreeId);
    return row ? rowToAgent(row) : null;
  }

  listByWorkspace(workspaceId: string): Agent[] {
    return this.db
      .prepare(
        `SELECT a.* FROM agents a
         JOIN worktrees w ON w.id = a.worktree_id
         WHERE w.workspace_id = ? AND a.archived_at IS NULL
         ORDER BY a.created_at DESC`,
      )
      .all(workspaceId)
      .map(rowToAgent);
  }

  listRunning(): Agent[] {
    return this.db
      .prepare(
        `SELECT * FROM agents
         WHERE status = 'running' AND archived_at IS NULL
         ORDER BY updated_at ASC`,
      )
      .all()
      .map(rowToAgent);
  }

  listArchived(): Agent[] {
    return this.db
      .prepare(
        `SELECT * FROM agents
         WHERE archived_at IS NOT NULL
         ORDER BY archived_at ASC`,
      )
      .all()
      .map(rowToAgent);
  }

  listByWorktreeId(worktreeId: string): Agent[] {
    return this.db
      .prepare(`SELECT * FROM agents WHERE worktree_id = ? ORDER BY created_at DESC`)
      .all(worktreeId)
      .map(rowToAgent);
  }

  countArchived(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM agents WHERE archived_at IS NOT NULL`)
      .get() as { count: number };
    return Number(row.count);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id);
  }

  update(agent: Agent): Agent {
    this.db
      .prepare(
        `UPDATE agents SET name = @name, status = @status, model = @model, effort = @effort,
         permission_mode = @permissionMode, claude_session_id = @claudeSessionId, pid = @pid,
         run_log_path = @runLogPath, updated_at = @updatedAt, archived_at = @archivedAt,
         active_session_id = @activeSessionId
         WHERE id = @id`,
      )
      .run({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        effort: agent.effort,
        permissionMode: agent.permissionMode,
        claudeSessionId: agent.claudeSessionId,
        pid: agent.pid,
        runLogPath: agent.runLogPath,
        updatedAt: agent.updatedAt,
        archivedAt: agent.archivedAt,
        activeSessionId: agent.activeSessionId,
      });
    return agent;
  }
}

export class ChatSessionRepository {
  constructor(private db: Database.Database) {}

  create(session: ChatSession): ChatSession {
    this.db
      .prepare(
        `INSERT INTO chat_sessions (
           id, agent_id, title, template, status, model, effort, permission_mode,
           claude_session_id, pid, run_log_path, created_at, updated_at, title_source
         ) VALUES (
           @id, @agentId, @title, @template, @status, @model, @effort, @permissionMode,
           @claudeSessionId, @pid, @runLogPath, @createdAt, @updatedAt, @titleSource
         )`,
      )
      .run({
        id: session.id,
        agentId: session.agentId,
        title: session.title,
        template: session.template,
        status: session.status,
        model: session.model,
        effort: session.effort,
        permissionMode: session.permissionMode,
        claudeSessionId: session.claudeSessionId,
        pid: session.pid,
        runLogPath: session.runLogPath,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        titleSource: session.titleSource ?? 'default',
      });
    return session;
  }

  getById(id: string): ChatSession | null {
    const row = this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id);
    return row ? rowToChatSession(row) : null;
  }

  listByAgent(agentId: string): ChatSession[] {
    return this.db
      .prepare('SELECT * FROM chat_sessions WHERE agent_id = ? ORDER BY created_at ASC')
      .all(agentId)
      .map(rowToChatSession);
  }

  listRunning(): ChatSession[] {
    return this.db
      .prepare(
        `SELECT * FROM chat_sessions
         WHERE status = 'running'
         ORDER BY updated_at ASC`,
      )
      .all()
      .map(rowToChatSession);
  }

  update(session: ChatSession): ChatSession {
    this.db
      .prepare(
        `UPDATE chat_sessions SET title = @title, template = @template, status = @status,
         model = @model, effort = @effort, permission_mode = @permissionMode,
         claude_session_id = @claudeSessionId, pid = @pid, run_log_path = @runLogPath,
         updated_at = @updatedAt, title_source = @titleSource
         WHERE id = @id`,
      )
      .run({
        id: session.id,
        title: session.title,
        template: session.template,
        status: session.status,
        model: session.model,
        effort: session.effort,
        permissionMode: session.permissionMode,
        claudeSessionId: session.claudeSessionId,
        pid: session.pid,
        runLogPath: session.runLogPath,
        updatedAt: session.updatedAt,
        titleSource: session.titleSource ?? 'default',
      });
    return session;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
  }

  setGrade(sessionId: string, grade: SessionGrade, transcript: string): ChatSession {
    const result = this.db
      .prepare(
        `UPDATE chat_sessions
         SET grade_score = @score, grade_comment = @comment, grade_transcript = @transcript,
             grade_analysis = @analysis, graded_at = @gradedAt, updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: sessionId,
        score: grade.score,
        comment: grade.comment,
        transcript,
        analysis: grade.analysis ? JSON.stringify(grade.analysis) : null,
        gradedAt: grade.gradedAt,
        updatedAt: grade.gradedAt,
      });
    if (result.changes === 0) throw new Error('Session not found');
    const updated = this.getById(sessionId);
    if (!updated) throw new Error('Session not found');
    return updated;
  }

  getGradeTranscript(sessionId: string): string {
    const row = this.db
      .prepare('SELECT grade_transcript FROM chat_sessions WHERE id = ?')
      .get(sessionId) as { grade_transcript?: unknown } | undefined;
    return row?.grade_transcript == null ? '' : String(row.grade_transcript);
  }
}

export class MessageRepository {
  constructor(private db: Database.Database) {}

  create(message: Message): Message {
    this.db
      .prepare(
        `INSERT INTO messages (id, agent_id, session_id, role, content, attachments, metadata, created_at)
         VALUES (@id, @agentId, @sessionId, @role, @content, @attachments, @metadata, @createdAt)`,
      )
      .run({
        id: message.id,
        agentId: message.agentId,
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        attachments: JSON.stringify(message.attachments ?? []),
        metadata: JSON.stringify(message.metadata ?? {}),
        createdAt: message.createdAt,
      });
    return message;
  }

  update(message: Message): Message {
    this.db
      .prepare(
        `UPDATE messages SET content = @content, attachments = @attachments, metadata = @metadata
         WHERE id = @id AND agent_id = @agentId`,
      )
      .run({
        id: message.id,
        agentId: message.agentId,
        content: message.content,
        attachments: JSON.stringify(message.attachments ?? []),
        metadata: JSON.stringify(message.metadata ?? {}),
      });
    return message;
  }

  // A user message and its assistant placeholder are created in the same
  // millisecond, so `created_at` alone leaves their order unspecified in
  // SQLite. Tie-break on rowid (insertion order) to keep transcripts — and
  // rewind's delete range, which slices this ordering — deterministic.
  listByAgent(agentId: string): Message[] {
    return this.db
      .prepare('SELECT * FROM messages WHERE agent_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(agentId)
      .map(rowToMessage);
  }

  listBySession(sessionId: string): Message[] {
    return this.db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(sessionId)
      .map(rowToMessage);
  }

  getById(agentId: string, messageId: string): Message | null {
    const row = this.db
      .prepare('SELECT * FROM messages WHERE agent_id = ? AND id = ?')
      .get(agentId, messageId);
    return row ? rowToMessage(row) : null;
  }

  /** Assistant turns that recorded a cost, without deserializing full metadata. */
  listCostRows(): Array<{
    agentId: string;
    sessionId: string | null;
    createdAt: string;
    costUsd: number;
  }> {
    return this.db
      .prepare(
        `SELECT agent_id AS agentId, session_id AS sessionId, created_at AS createdAt,
                CAST(json_extract(metadata, '$.costUsd') AS REAL) AS costUsd
         FROM messages
         WHERE role = 'assistant' AND json_extract(metadata, '$.costUsd') IS NOT NULL`,
      )
      .all() as Array<{
      agentId: string;
      sessionId: string | null;
      createdAt: string;
      costUsd: number;
    }>;
  }

  /**
   * Delete the given message and every later message in the same session
   * (ordered by created_at, then insertion order).
   */
  deleteFrom(agentId: string, messageId: string): { removed: number; target: Message | null } {
    const target = this.getById(agentId, messageId);
    if (!target) return { removed: 0, target: null };

    const messages = this.listBySession(target.sessionId);
    const index = messages.findIndex((item) => item.id === messageId);
    if (index < 0) return { removed: 0, target: null };

    const toDelete = messages.slice(index);
    const ids = toDelete.map((item) => item.id);
    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db
      .prepare(`DELETE FROM messages WHERE agent_id = ? AND id IN (${placeholders})`)
      .run(agentId, ...ids);
    return { removed: result.changes, target };
  }

  deleteByAgent(agentId: string): number {
    const result = this.db.prepare('DELETE FROM messages WHERE agent_id = ?').run(agentId);
    return result.changes;
  }

  deleteBySession(sessionId: string): number {
    const result = this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
    return result.changes;
  }

  findAttachment(agentId: string, attachmentId: string): MessageAttachment | null {
    const messages = this.listByAgent(agentId);
    for (const message of messages) {
      const match = message.attachments.find((item) => item.id === attachmentId);
      if (match) return match;
    }
    return null;
  }
}

export class QueuedMessageRepository {
  constructor(private db: Database.Database) {}

  create(message: QueuedChatMessage): QueuedChatMessage {
    this.db
      .prepare(
        `INSERT INTO queued_messages (id, agent_id, session_id, content, attachments, created_at)
         VALUES (@id, @agentId, @sessionId, @content, @attachments, @createdAt)`,
      )
      .run({
        id: message.id,
        agentId: message.agentId,
        sessionId: message.sessionId,
        content: message.content,
        attachments: JSON.stringify(message.attachments ?? []),
        createdAt: message.createdAt,
      });
    return message;
  }

  listBySession(sessionId: string): QueuedChatMessage[] {
    // rowid preserves insertion order even when created_at timestamps tie.
    return this.db
      .prepare('SELECT * FROM queued_messages WHERE session_id = ? ORDER BY rowid ASC')
      .all(sessionId)
      .map(rowToQueuedMessage);
  }

  getById(id: string): QueuedChatMessage | null {
    const row = this.db.prepare('SELECT * FROM queued_messages WHERE id = ?').get(id);
    return row ? rowToQueuedMessage(row) : null;
  }

  /** Remove and return the oldest queued message for the session, if any. */
  takeNext(sessionId: string): QueuedChatMessage | null {
    const next = this.listBySession(sessionId)[0] ?? null;
    if (next) this.delete(next.id);
    return next;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM queued_messages WHERE id = ?').run(id);
  }

  deleteBySession(sessionId: string): number {
    const result = this.db
      .prepare('DELETE FROM queued_messages WHERE session_id = ?')
      .run(sessionId);
    return result.changes;
  }

  /** Session ids that still have queued messages (used to drain after restart). */
  listSessionIdsWithQueued(): string[] {
    return this.db
      .prepare('SELECT DISTINCT session_id FROM queued_messages')
      .all()
      .map((row) => String((row as Record<string, unknown>).session_id));
  }
}

export class EventRepository {
  constructor(private db: Database.Database) {}

  create(event: AgentEvent): AgentEvent {
    this.db
      .prepare(
        `INSERT INTO events (id, agent_id, type, data, created_at)
         VALUES (@id, @agentId, @type, @data, @createdAt)`,
      )
      .run({
        id: event.id,
        agentId: event.agentId,
        type: event.type,
        data: JSON.stringify(event.data),
        createdAt: event.createdAt,
      });
    return event;
  }

  listByAgent(agentId: string): AgentEvent[] {
    return this.db
      .prepare('SELECT * FROM events WHERE agent_id = ? ORDER BY created_at ASC')
      .all(agentId)
      .map((row) => ({
        ...rowToEvent(row),
        data: parseJson<Record<string, unknown>>(String((row as Record<string, unknown>).data), {}),
      }));
  }
}

function rowToWorkspace(row: unknown): Workspace {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name),
    repoUrl: String(r.repo_url),
    repoPath: String(r.repo_path),
    defaultBranch: String(r.default_branch),
    githubOwner: String(r.github_owner),
    githubRepo: String(r.github_repo),
    createdAt: String(r.created_at),
  };
}

function rowToWorktree(row: unknown): Worktree {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    name: String(r.name),
    path: String(r.path),
    branch: String(r.branch),
    prNumber: r.pr_number == null ? null : Number(r.pr_number),
    prTitle: r.pr_title == null ? null : String(r.pr_title),
    baseBranch: r.base_branch == null ? null : String(r.base_branch),
    createdAt: String(r.created_at),
  };
}

const EFFORT_LEVELS = new Set<EffortLevel>(['low', 'medium', 'high', 'xhigh', 'max']);

function parseEffort(value: unknown): EffortLevel {
  const raw = typeof value === 'string' ? value : '';
  return EFFORT_LEVELS.has(raw as EffortLevel) ? (raw as EffortLevel) : DEFAULT_EFFORT_LEVEL;
}

function rowToAgent(row: unknown): Agent {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    worktreeId: String(r.worktree_id),
    name: String(r.name),
    status: r.status as Agent['status'],
    model: String(r.model),
    effort: parseEffort(r.effort),
    permissionMode: (r.permission_mode as PermissionMode | undefined) ?? 'plan',
    claudeSessionId: r.claude_session_id == null ? null : String(r.claude_session_id),
    pid: r.pid == null ? null : Number(r.pid),
    runLogPath: r.run_log_path == null ? null : String(r.run_log_path),
    activeSessionId: r.active_session_id == null ? null : String(r.active_session_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    archivedAt: r.archived_at == null ? null : String(r.archived_at),
  };
}

const SESSION_TEMPLATES = new Set<ChatSessionTemplateId>([
  'chat',
  'build',
  'create-draft-pr',
  'review',
]);

function parseSessionTemplate(value: unknown): ChatSessionTemplateId {
  const raw = typeof value === 'string' ? value : '';
  return SESSION_TEMPLATES.has(raw as ChatSessionTemplateId)
    ? (raw as ChatSessionTemplateId)
    : 'chat';
}

function parseTitleSource(value: unknown): ChatSessionTitleSource {
  return value === 'auto' || value === 'user' ? value : 'default';
}

function parseGradeScore(value: unknown): SessionGradeScore | null {
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(score) || score < 1 || score > 5) return null;
  return score as SessionGradeScore;
}

function parseGradeAnalysis(value: unknown): SessionGradeAnalysis | null {
  if (value == null || value === '') return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    if (typeof row.summary !== 'string' || !Array.isArray(row.findings) || !row.stats) return null;
    const sessionFilePath =
      typeof row.sessionFilePath === 'string' && row.sessionFilePath.trim()
        ? row.sessionFilePath
        : null;
    return { ...(parsed as SessionGradeAnalysis), sessionFilePath };
  } catch {
    return null;
  }
}

function rowToGrade(row: Record<string, unknown>): SessionGrade | null {
  const score = parseGradeScore(row.grade_score);
  if (score == null || row.graded_at == null) return null;
  return {
    score,
    comment: row.grade_comment == null ? '' : String(row.grade_comment),
    gradedAt: String(row.graded_at),
    analysis: parseGradeAnalysis(row.grade_analysis),
  };
}

function rowToChatSession(row: unknown): ChatSession {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    title: String(r.title),
    template: parseSessionTemplate(r.template),
    status: r.status as ChatSession['status'],
    model: String(r.model),
    effort: parseEffort(r.effort),
    permissionMode: (r.permission_mode as PermissionMode | undefined) ?? 'plan',
    claudeSessionId: r.claude_session_id == null ? null : String(r.claude_session_id),
    pid: r.pid == null ? null : Number(r.pid),
    runLogPath: r.run_log_path == null ? null : String(r.run_log_path),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    grade: rowToGrade(r),
    titleSource: parseTitleSource(r.title_source),
  };
}

function attachmentUrl(agentId: string, attachmentId: string): string {
  return `/api/agents/${agentId}/attachments/${attachmentId}`;
}

function rowToMessage(row: unknown): Message {
  const r = row as Record<string, unknown>;
  const agentId = String(r.agent_id);
  const attachments = parseJson<MessageAttachment[]>(String(r.attachments ?? '[]'), []).map(
    (item) => ({
      ...item,
      url: item.url || attachmentUrl(agentId, item.id),
    }),
  );
  return {
    id: String(r.id),
    agentId,
    sessionId: r.session_id == null ? '' : String(r.session_id),
    role: r.role as Message['role'],
    content: String(r.content),
    attachments,
    metadata: parseJson<MessageMetadata>(String(r.metadata ?? '{}'), {}),
    createdAt: String(r.created_at),
  };
}

function rowToQueuedMessage(row: unknown): QueuedChatMessage {
  const r = row as Record<string, unknown>;
  const agentId = String(r.agent_id);
  const attachments = parseJson<MessageAttachment[]>(String(r.attachments ?? '[]'), []).map(
    (item) => ({
      ...item,
      url: item.url || attachmentUrl(agentId, item.id),
    }),
  );
  return {
    id: String(r.id),
    agentId,
    sessionId: String(r.session_id),
    content: String(r.content),
    attachments,
    createdAt: String(r.created_at),
  };
}

function rowToEvent(row: unknown): AgentEvent {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    type: String(r.type),
    data: {},
    createdAt: String(r.created_at),
  };
}

export type AppRepositories = {
  workspaces: WorkspaceRepository;
  worktrees: WorktreeRepository;
  agents: AgentRepository;
  sessions: ChatSessionRepository;
  messages: MessageRepository;
  events: EventRepository;
  queued: QueuedMessageRepository;
};

export function createRepositories(db: Database.Database): AppRepositories {
  return {
    workspaces: new WorkspaceRepository(db),
    worktrees: new WorktreeRepository(db),
    agents: new AgentRepository(db),
    sessions: new ChatSessionRepository(db),
    messages: new MessageRepository(db),
    events: new EventRepository(db),
    queued: new QueuedMessageRepository(db),
  };
}
