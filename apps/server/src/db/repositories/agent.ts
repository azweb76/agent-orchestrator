import type Database from 'better-sqlite3';
import type { Agent } from '@agent-orchestrator/shared';
import { rowToAgent } from '../row-mappers.js';

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
