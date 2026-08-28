import type Database from 'better-sqlite3';
import type { Message, MessageAttachment } from '@agent-orchestrator/shared';
import { rowToMessage } from '../row-mappers.js';

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
