import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppEvent, AppEventType } from '@agent-orchestrator/shared';

const EVENT_TYPES: AppEventType[] = [
  'agent_changed',
  'run_finished',
  'permission_request',
  'queue_changed',
  'workspaces_changed',
  'instruction_draft_offer',
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
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
        queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
        queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
        queryClient.invalidateQueries({ queryKey: ['queue', agentId] });
      }
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
    case 'instruction_draft_offer':
      // The offer banner renders from the session grade on the agent detail.
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      }
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
    const token = (() => {
      try {
        return localStorage.getItem('ao.authToken') ?? '';
      } catch {
        return '';
      }
    })();
    const source = new EventSource(
      token
        ? `/api/events/stream?access_token=${encodeURIComponent(token)}`
        : '/api/events/stream',
    );

    let openedOnce = false;
    source.onopen = () => {
      // Replay is not stored; a reconnect can miss run_finished. Refresh the
      // caches that keep the agent page in sync with the backend.
      if (!openedOnce) {
        openedOnce = true;
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['agent'] });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['permissions'] });
      void queryClient.invalidateQueries({ queryKey: ['queue'] });
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    };

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
