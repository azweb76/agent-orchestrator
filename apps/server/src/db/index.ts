import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type {
  Agent,
  AgentEvent,
  Message,
  MessageAttachment,
  MessageMetadata,
  PermissionMode,
  Worktree,
  Workspace,
} from '@agent-orchestrator/shared';

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
  environment TEXT,
  permission_mode TEXT NOT NULL DEFAULT 'plan',
  claude_session_id TEXT,
  pid INTEGER,
  run_log_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_worktrees_workspace ON worktrees(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_worktree ON agents(worktree_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
`;

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

function migrateSchema(db: Database.Database): void {
  ensureColumn(db, 'agents', 'pid', 'INTEGER');
  ensureColumn(db, 'agents', 'run_log_path', 'TEXT');
  ensureColumn(db, 'agents', 'permission_mode', "TEXT NOT NULL DEFAULT 'plan'");
  ensureColumn(db, 'messages', 'attachments', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'messages', 'metadata', "TEXT NOT NULL DEFAULT '{}'");
}

export function initDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'agent-orchestrator.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrateSchema(db);
  return db;
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
        `INSERT INTO agents (id, worktree_id, name, status, model, environment, permission_mode, claude_session_id, pid, run_log_path, created_at, updated_at, archived_at)
         VALUES (@id, @worktreeId, @name, @status, @model, @environment, @permissionMode, @claudeSessionId, @pid, @runLogPath, @createdAt, @updatedAt, @archivedAt)`,
      )
      .run({
        id: agent.id,
        worktreeId: agent.worktreeId,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        environment: agent.environment,
        permissionMode: agent.permissionMode,
        claudeSessionId: agent.claudeSessionId,
        pid: agent.pid,
        runLogPath: agent.runLogPath,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        archivedAt: agent.archivedAt,
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

  update(agent: Agent): Agent {
    this.db
      .prepare(
        `UPDATE agents SET name = @name, status = @status, model = @model, environment = @environment,
         permission_mode = @permissionMode, claude_session_id = @claudeSessionId, pid = @pid,
         run_log_path = @runLogPath, updated_at = @updatedAt, archived_at = @archivedAt
         WHERE id = @id`,
      )
      .run({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        environment: agent.environment,
        permissionMode: agent.permissionMode,
        claudeSessionId: agent.claudeSessionId,
        pid: agent.pid,
        runLogPath: agent.runLogPath,
        updatedAt: agent.updatedAt,
        archivedAt: agent.archivedAt,
      });
    return agent;
  }
}

export class MessageRepository {
  constructor(private db: Database.Database) {}

  create(message: Message): Message {
    this.db
      .prepare(
        `INSERT INTO messages (id, agent_id, role, content, attachments, metadata, created_at)
         VALUES (@id, @agentId, @role, @content, @attachments, @metadata, @createdAt)`,
      )
      .run({
        id: message.id,
        agentId: message.agentId,
        role: message.role,
        content: message.content,
        attachments: JSON.stringify(message.attachments ?? []),
        metadata: JSON.stringify(message.metadata ?? {}),
        createdAt: message.createdAt,
      });
    return message;
  }

  listByAgent(agentId: string): Message[] {
    return this.db
      .prepare('SELECT * FROM messages WHERE agent_id = ? ORDER BY created_at ASC')
      .all(agentId)
      .map(rowToMessage);
  }

  deleteByAgent(agentId: string): number {
    const result = this.db.prepare('DELETE FROM messages WHERE agent_id = ?').run(agentId);
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

function rowToAgent(row: unknown): Agent {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    worktreeId: String(r.worktree_id),
    name: String(r.name),
    status: r.status as Agent['status'],
    model: String(r.model),
    environment: r.environment == null ? null : String(r.environment),
    permissionMode: (r.permission_mode as PermissionMode | undefined) ?? 'plan',
    claudeSessionId: r.claude_session_id == null ? null : String(r.claude_session_id),
    pid: r.pid == null ? null : Number(r.pid),
    runLogPath: r.run_log_path == null ? null : String(r.run_log_path),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    archivedAt: r.archived_at == null ? null : String(r.archived_at),
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
    role: r.role as Message['role'],
    content: String(r.content),
    attachments,
    metadata: parseJson<MessageMetadata>(String(r.metadata ?? '{}'), {}),
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
  messages: MessageRepository;
  events: EventRepository;
};

export function createRepositories(db: Database.Database): AppRepositories {
  return {
    workspaces: new WorkspaceRepository(db),
    worktrees: new WorktreeRepository(db),
    agents: new AgentRepository(db),
    messages: new MessageRepository(db),
    events: new EventRepository(db),
  };
}
