import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { DATABASE_FILENAME, createRepositories, initDatabase } from './index.js';

const LEGACY_SCHEMA = `
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE worktrees (
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

CREATE TABLE agents (
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
  archived_at TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`;

function writeLegacyDatabase(dataDir: string): void {
  const db = new Database(path.join(dataDir, DATABASE_FILENAME));
  db.pragma('foreign_keys = ON');
  db.exec(LEGACY_SCHEMA);
  db.exec(`
    INSERT INTO workspaces (id, name, repo_url, repo_path, default_branch, github_owner, github_repo, created_at)
    VALUES ('ws-1', 'demo', 'https://github.com/example/demo', '/tmp/demo', 'main', 'example', 'demo', '2026-01-01T00:00:00.000Z');
    INSERT INTO worktrees (id, workspace_id, name, path, branch, pr_number, pr_title, base_branch, created_at)
    VALUES ('wt-1', 'ws-1', 'agent-1', '/tmp/wt', 'feat', NULL, NULL, 'main', '2026-01-01T00:00:00.000Z');
    INSERT INTO agents (id, worktree_id, name, status, model, effort, permission_mode, claude_session_id, created_at, updated_at)
    VALUES ('ag-1', 'wt-1', 'Agent', 'idle', 'sonnet', 'high', 'plan', 'claude-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    INSERT INTO messages (id, agent_id, role, content, created_at)
    VALUES ('m1', 'ag-1', 'user', 'hello from legacy', '2026-01-01T00:00:01.000Z');
  `);
  db.close();
}

describe('initDatabase schema repair', () => {
  it('adds session_id to a pre-sessions database and backfills chat history', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-db-legacy-'));
    try {
      writeLegacyDatabase(dataDir);

      const db = initDatabase(dataDir);
      try {
        const cols = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
        assert.ok(cols.some((col) => col.name === 'session_id'));

        const repos = createRepositories(db);
        const sessions = repos.sessions.listByAgent('ag-1');
        assert.equal(sessions.length, 1);
        assert.equal(sessions[0]?.claudeSessionId, 'claude-1');
        assert.equal(repos.agents.getById('ag-1')?.activeSessionId, sessions[0]?.id);
        const messages = repos.messages.listBySession(sessions[0]!.id);
        assert.equal(messages.length, 1);
        assert.equal(messages[0]?.content, 'hello from legacy');
        assert.equal(repos.workspaces.list().length, 1);
        const fromGoal = repos.sessionProfiles.getByName('from-goal');
        assert.ok(fromGoal);
        assert.equal(fromGoal?.builtIn, true);
      } finally {
        db.close();
      }
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('backs up a corrupt database and starts over', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-db-corrupt-'));
    try {
      fs.writeFileSync(path.join(dataDir, DATABASE_FILENAME), 'this is not a sqlite database');

      const db = initDatabase(dataDir);
      try {
        const repos = createRepositories(db);
        assert.deepEqual(repos.workspaces.list(), []);
        const backups = fs.readdirSync(dataDir).filter((name) => name.includes('.broken.'));
        assert.ok(backups.some((name) => name.startsWith(DATABASE_FILENAME)));
      } finally {
        db.close();
      }
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
