import type Database from 'better-sqlite3';
import type { AgentEvent } from '@agent-orchestrator/shared';
import { parseJson, rowToEvent } from '../row-mappers.js';

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
