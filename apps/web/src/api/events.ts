import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppEvent, AppEventType } from '@agent-orchestrator/shared';

const EVENT_TYPES: AppEventType[] = [
  'agent_changed',
  'run_finished',
  'permission_request',
  'queue_changed',
  'workspaces_changed',
];

type AppEventListener = (event: AppEvent) => void;

const listeners = new Set<AppEventListener>();

/** Subscribe to live app events (already parsed); returns an unsubscribe fn. */
export function onAppEvent(listener: AppEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function invalidateForEvent(queryClient: QueryClient, event: AppEvent): void {
  const { agentId, sessionId } = event;
  switch (event.type) {
    case 'agent_changed':
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      if (agentId) queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      break;
    case 'run_finished':
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
        queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
        queryClient.invalidateQueries({ queryKey: ['events', agentId] });
        if (sessionId) {
          queryClient.invalidateQueries({ queryKey: ['messages', agentId, sessionId] });
          queryClient.invalidateQueries({ queryKey: ['queue', agentId, sessionId] });
          queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionId] });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      break;
    case 'permission_request':
      if (agentId && sessionId) {
        queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionId] });
      }
      break;
    case 'queue_changed':
      if (agentId && sessionId) {
        queryClient.invalidateQueries({ queryKey: ['queue', agentId, sessionId] });
      }
      break;
    case 'workspaces_changed':
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      break;
  }
}

/**
 * Open the global SSE stream once (mounted from AppLayout). Events invalidate
 * the relevant TanStack Query caches, which lets list polling stay slow, and
 * fan out to `onAppEvent` subscribers (e.g. browser notifications).
 */
export function useAppEventStream(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/api/events/stream');

    const handle = (raw: MessageEvent) => {
      let event: AppEvent;
      try {
        event = JSON.parse(String(raw.data)) as AppEvent;
      } catch {
        return;
      }
      invalidateForEvent(queryClient, event);
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {
          // subscriber errors must not break the stream
        }
      }
    };

    for (const type of EVENT_TYPES) {
      source.addEventListener(type, handle);
    }
    return () => {
      source.close();
    };
  }, [queryClient]);
}
