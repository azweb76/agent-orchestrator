import { useEffect, useState } from 'react';
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

export type SseConnectionState = 'connecting' | 'connected' | 'disconnected';

let connectionState: SseConnectionState = 'connecting';
const connectionListeners = new Set<(state: SseConnectionState) => void>();

function setConnectionState(next: SseConnectionState): void {
  if (connectionState === next) return;
  connectionState = next;
  for (const listener of [...connectionListeners]) {
    try {
      listener(next);
    } catch {
      // subscriber errors must not break the stream
    }
  }
}

/** Current fleet SSE connection state (for polling fallbacks and UI). */
export function getSseConnectionState(): SseConnectionState {
  return connectionState;
}

export function onSseConnectionStateChange(
  listener: (state: SseConnectionState) => void,
): () => void {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

export function useSseConnectionState(): SseConnectionState {
  const [state, setState] = useState(connectionState);
  useEffect(() => onSseConnectionStateChange(setState), []);
  return state;
}

/** Subscribe to live app events (already parsed); returns an unsubscribe fn. */
export function onAppEvent(listener: AppEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function dispatchAppEvent(event: AppEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // subscriber errors must not break the stream
    }
  }
}

function invalidateForEvent(queryClient: QueryClient, event: AppEvent): void {
  const { agentId, sessionId } = event;
  switch (event.type) {
    case 'agent_changed':
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
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
      queryClient.invalidateQueries({ queryKey: ['usage'] });
      break;
    case 'permission_request':
      if (agentId && sessionId) {
        queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionId] });
      }
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
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
      queryClient.invalidateQueries({ queryKey: ['status'] });
      break;
    case 'instruction_draft_offer':
      // The offer banner renders from the session grade on the agent detail.
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      }
      break;
  }
}

function handleStreamEvent(queryClient: QueryClient, raw: MessageEvent): void {
  let event: AppEvent;
  try {
    event = JSON.parse(String(raw.data)) as AppEvent;
  } catch {
    return;
  }
  invalidateForEvent(queryClient, event);
  dispatchAppEvent(event);
}

/**
 * Open the global SSE stream once (mounted from AppLayout). Events invalidate
 * the relevant TanStack Query caches and fan out to `onAppEvent` subscribers
 * (e.g. browser notifications). Reconnect replays missed events via
 * `Last-Event-ID`; cache invalidation on reconnect is a backup when replay
 * falls outside the server buffer.
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
      setConnectionState('connected');
      // Replay via Last-Event-ID re-emits missed events to onAppEvent listeners.
      // Still invalidate caches as a backup when the replay buffer is exhausted.
      if (!openedOnce) {
        openedOnce = true;
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['agent'] });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['permissions'] });
      void queryClient.invalidateQueries({ queryKey: ['queue'] });
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    };

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setConnectionState('disconnected');
        return;
      }
      setConnectionState('disconnected');
    };

    const handle = (raw: MessageEvent) => handleStreamEvent(queryClient, raw);

    for (const type of EVENT_TYPES) {
      source.addEventListener(type, handle);
    }
    return () => {
      source.close();
      setConnectionState('disconnected');
    };
  }, [queryClient]);
}
