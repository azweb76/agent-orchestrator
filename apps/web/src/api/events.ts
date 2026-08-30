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
  'draft_pr_offer',
  'task_suggestions_offer',
  'github_pr_changed',
  'automation_triggered',
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

/** Invalidate only the query keys that need fresh data for this SSE event. */
export function invalidateForEvent(queryClient: QueryClient, event: AppEvent): void {
  const { agentId, sessionId } = event;
  switch (event.type) {
    case 'agent_changed':
      // Fleet sidebar shows status; agent detail covers the open agent page.
      // Do not invalidate messages/permissions/queue prefixes — chat streams
      // and session-scoped events keep those caches current.
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['claude-processes'] });
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
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
      queryClient.invalidateQueries({ queryKey: ['claude-processes'] });
      break;
    case 'permission_request':
      if (agentId && sessionId) {
        queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionId] });
      }
      // Sidebar badge updates on run_finished; avoid refetching the full tree
      // on every permission prompt while the chat panel handles the card.
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
    case 'draft_pr_offer':
    case 'task_suggestions_offer':
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      }
      break;
    case 'github_pr_changed': {
      queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      }
      const owner = typeof event.data.owner === 'string' ? event.data.owner : null;
      const repo = typeof event.data.repo === 'string' ? event.data.repo : null;
      const number = typeof event.data.number === 'number' ? event.data.number : null;
      if (owner && repo && number != null) {
        queryClient.invalidateQueries({ queryKey: ['pr', owner, repo, number] });
      }
      break;
    }
    case 'automation_triggered':
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
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
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
      void queryClient.invalidateQueries({ queryKey: ['agent'] });
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
