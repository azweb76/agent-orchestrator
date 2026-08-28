import { v4 as uuidv4 } from 'uuid';
import type { AppEvent, AppEventType } from '@agent-orchestrator/shared';

type Listener = (event: AppEvent) => void;

/**
 * In-process pub/sub for live app state changes. The router exposes it as one
 * SSE stream (`GET /api/events/stream`) so the web client can invalidate its
 * caches and raise notifications without tight polling loops.
 */
/** Recent events replayed on SSE reconnect via `Last-Event-ID`. */
const REPLAY_CAPACITY = 200;

export class Notifier {
  private listeners = new Set<Listener>();
  private replay: AppEvent[] = [];

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(
    type: AppEventType,
    fields: { agentId?: string; sessionId?: string; data?: Record<string, unknown> } = {},
  ): AppEvent {
    const event: AppEvent = {
      id: uuidv4(),
      type,
      agentId: fields.agentId ?? null,
      sessionId: fields.sessionId ?? null,
      data: fields.data ?? {},
      createdAt: new Date().toISOString(),
    };
    this.replay.push(event);
    if (this.replay.length > REPLAY_CAPACITY) {
      this.replay.shift();
    }
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // one bad subscriber must not break the rest
      }
    }
    return event;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  /** Events after `lastEventId`, or the full buffer when the id is unknown. */
  replaySince(lastEventId: string | undefined): AppEvent[] {
    if (!lastEventId) return [];
    const idx = this.replay.findIndex((event) => event.id === lastEventId);
    if (idx < 0) return [...this.replay];
    return this.replay.slice(idx + 1);
  }
}
