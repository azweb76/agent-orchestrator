import type Database from 'better-sqlite3';
import type { AssistantMessage, AssistantMessageRole, AssistantToolCall, AssistantToolResultMeta } from '@agent-orchestrator/shared';

function rowToMessage(row: Record<string, unknown>): AssistantMessage {
  const metadata = JSON.parse(String(row.metadata || '{}')) as {
    toolCalls?: AssistantToolCall[];
    toolResult?: AssistantToolResultMeta;
  };
  return {
    id: String(row.id),
    role: row.role as AssistantMessageRole,
    content: String(row.content),
    toolCalls: metadata.toolCalls,
    toolResult: metadata.toolResult,
    createdAt: String(row.created_at),
  };
}

export class AssistantMessageRepository {
  constructor(private db: Database.Database) {}

  create(message: AssistantMessage): AssistantMessage {
    this.db
      .prepare(
        `INSERT INTO assistant_messages (id, role, content, metadata, created_at)
         VALUES (@id, @role, @content, @metadata, @createdAt)`,
      )
      .run({
        id: message.id,
        role: message.role,
        content: message.content,
        metadata: JSON.stringify({
          toolCalls: message.toolCalls,
          toolResult: message.toolResult,
        }),
        createdAt: message.createdAt,
      });
    return message;
  }

  list(limit = 200): AssistantMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM assistant_messages
         ORDER BY created_at ASC, rowid ASC
         LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }

  clear(): void {
    this.db.prepare('DELETE FROM assistant_messages').run();
  }
}
