import type Database from 'better-sqlite3';
import type { AgentMemory } from '@agent-orchestrator/shared';

function rowToMemory(row: Record<string, unknown>): AgentMemory {
  return {
    id: String(row.id),
    scope: row.scope as AgentMemory['scope'],
    workspaceId: row.workspace_id == null ? null : String(row.workspace_id),
    agentId: row.agent_id == null ? null : String(row.agent_id),
    kind: (row.kind as AgentMemory['kind']) || 'fact',
    key: String(row.key),
    content: String(row.content),
    source: (row.source as AgentMemory['source']) || 'user',
    sourceSessionId: row.source_session_id == null ? null : String(row.source_session_id),
    status: (row.status as AgentMemory['status']) || 'active',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class AgentMemoryRepository {
  constructor(private db: Database.Database) {}

  create(memory: AgentMemory): AgentMemory {
    this.db
      .prepare(
        `INSERT INTO agent_memories (
           id, scope, workspace_id, agent_id, kind, key, content,
           source, source_session_id, status, created_at, updated_at
         ) VALUES (
           @id, @scope, @workspaceId, @agentId, @kind, @key, @content,
           @source, @sourceSessionId, @status, @createdAt, @updatedAt
         )`,
      )
      .run({
        id: memory.id,
        scope: memory.scope,
        workspaceId: memory.workspaceId,
        agentId: memory.agentId,
        kind: memory.kind,
        key: memory.key,
        content: memory.content,
        source: memory.source,
        sourceSessionId: memory.sourceSessionId,
        status: memory.status,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
      });
    return memory;
  }

  getById(id: string): AgentMemory | null {
    const row = this.db.prepare('SELECT * FROM agent_memories WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToMemory(row) : null;
  }

  update(memory: AgentMemory): AgentMemory {
    this.db
      .prepare(
        `UPDATE agent_memories SET
           kind = @kind, key = @key, content = @content, status = @status, updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: memory.id,
        kind: memory.kind,
        key: memory.key,
        content: memory.content,
        status: memory.status,
        updatedAt: memory.updatedAt,
      });
    return memory;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM agent_memories WHERE id = ?').run(id);
  }

  listActiveForAgent(agentId: string, workspaceId: string): AgentMemory[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_memories
         WHERE status = 'active'
           AND (
             scope = 'global'
             OR (scope = 'workspace' AND workspace_id = ?)
             OR (scope = 'agent' AND agent_id = ?)
           )
         ORDER BY updated_at DESC`,
      )
      .all(workspaceId, agentId) as Array<Record<string, unknown>>;
    return rows.map(rowToMemory);
  }

  listForAgentView(agentId: string, workspaceId: string): AgentMemory[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_memories
         WHERE
           scope = 'global'
           OR (scope = 'workspace' AND workspace_id = ?)
           OR (scope = 'agent' AND agent_id = ?)
         ORDER BY status ASC, updated_at DESC`,
      )
      .all(workspaceId, agentId) as Array<Record<string, unknown>>;
    return rows.map(rowToMemory);
  }

  findActiveByScopeKey(params: {
    scope: AgentMemory['scope'];
    workspaceId: string | null;
    agentId: string | null;
    key: string;
  }): AgentMemory | null {
    const row = this.db
      .prepare(
        `SELECT * FROM agent_memories
         WHERE status = 'active'
           AND scope = ?
           AND key = ?
           AND (
             (? = 'global' AND workspace_id IS NULL AND agent_id IS NULL)
             OR (? = 'workspace' AND workspace_id = ? AND agent_id IS NULL)
             OR (? = 'agent' AND agent_id = ?)
           )
         LIMIT 1`,
      )
      .get(
        params.scope,
        params.key,
        params.scope,
        params.scope,
        params.workspaceId,
        params.scope,
        params.agentId,
      ) as Record<string, unknown> | undefined;
    return row ? rowToMemory(row) : null;
  }
}
