import { v4 as uuidv4 } from 'uuid';
import type { AppEvent, AppEventType } from '@agent-orchestrator/shared';

type Listener = (event: AppEvent) => void;

/**
 * In-process pub/sub for live app state changes. The router exposes it as one
 * SSE stream (`GET /api/events/stream`) so the web client can invalidate its
 * caches and raise notifications without tight polling loops.
 */
export class Notifier {
  private listeners = new Set<Listener>();

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
}
