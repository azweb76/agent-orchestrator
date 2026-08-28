import type Database from 'better-sqlite3';
import type { QueuedChatMessage } from '@agent-orchestrator/shared';
import { rowToQueuedMessage } from '../row-mappers.js';

export class QueuedMessageRepository {
  constructor(private db: Database.Database) {}

  create(message: QueuedChatMessage): QueuedChatMessage {
    this.db
      .prepare(
        `INSERT INTO queued_messages (id, agent_id, session_id, content, attachments, mentions, blocked_reason, created_at)
         VALUES (@id, @agentId, @sessionId, @content, @attachments, @mentions, @blockedReason, @createdAt)`,
      )
      .run({
        id: message.id,
        agentId: message.agentId,
        sessionId: message.sessionId,
        content: message.content,
        attachments: JSON.stringify(message.attachments ?? []),
        mentions: JSON.stringify(message.mentions ?? []),
        blockedReason: message.blockedReason ?? null,
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

  /** Update blocked reason for all queued messages on a session. */
  setBlockedReason(sessionId: string, blockedReason: string | null): void {
    this.db
      .prepare('UPDATE queued_messages SET blocked_reason = ? WHERE session_id = ?')
      .run(blockedReason, sessionId);
  }

  clearBlockedReason(sessionId: string): void {
    this.setBlockedReason(sessionId, null);
  }

  /** Session ids that still have queued messages (used to drain after restart). */
  listSessionIdsWithQueued(): string[] {
    return this.db
      .prepare('SELECT DISTINCT session_id FROM queued_messages')
      .all()
      .map((row) => String((row as Record<string, unknown>).session_id));
  }
}
