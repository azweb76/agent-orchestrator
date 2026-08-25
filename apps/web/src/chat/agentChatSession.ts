import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  appendStreamText,
  applyStreamEvent,
  extractPlanFromInput,
  type Message,
  type PermissionRequest,
  type StreamPart,
} from '@agent-orchestrator/shared';
import { api, streamBuildPlan, streamChat, streamChatLive } from '../api/client';
import type { PendingImage, QueuedChatItem } from '../components/chat/ChatComposer';

export interface AgentChatSessionState {
  optimistic: Message[];
  streamParts: StreamPart[];
  isStreaming: boolean;
  /** `live` is a read-only follow; sending a message should interrupt it, not queue. */
  streamMode: 'chat' | 'live' | null;
  queue: QueuedChatItem[];
  permissionRequests: PermissionRequest[];
  chatError: string | null;
  lastFailed: { text: string; images: PendingImage[] } | null;
  permissionBusy: boolean;
}

interface AgentChatSession extends AgentChatSessionState {
  abort: AbortController | null;
  listeners: Set<() => void>;
  /** Cached snapshot for useSyncExternalStore referential stability. */
  snapshot: AgentChatSessionState;
  /** Generation token so stale async finally/onDone handlers cannot clobber a newer run. */
  runId: number;
}

const EMPTY_STATE: AgentChatSessionState = {
  optimistic: [],
  streamParts: [],
  isStreaming: false,
  streamMode: null,
  queue: [],
  permissionRequests: [],
  chatError: null,
  lastFailed: null,
  permissionBusy: false,
};

const sessions = new Map<string, AgentChatSession>();

function toSnapshot(session: AgentChatSessionState): AgentChatSessionState {
  return {
    optimistic: session.optimistic,
    streamParts: session.streamParts,
    isStreaming: session.isStreaming,
    streamMode: session.streamMode,
    queue: session.queue,
    permissionRequests: session.permissionRequests,
    chatError: session.chatError,
    lastFailed: session.lastFailed,
    permissionBusy: session.permissionBusy,
  };
}

function createSession(): AgentChatSession {
  const base = {
    ...EMPTY_STATE,
    optimistic: [] as Message[],
    streamParts: [] as StreamPart[],
    queue: [] as QueuedChatItem[],
    permissionRequests: [] as PermissionRequest[],
    abort: null as AbortController | null,
    listeners: new Set<() => void>(),
    runId: 0,
  };
  return {
    ...base,
    snapshot: toSnapshot(base),
  };
}

function ensureSession(agentId: string): AgentChatSession {
  let session = sessions.get(agentId);
  if (!session) {
    session = createSession();
    sessions.set(agentId, session);
  }
  return session;
}

function emit(agentId: string): void {
  const session = sessions.get(agentId);
  if (!session) return;
  session.snapshot = toSnapshot(session);
  for (const listener of session.listeners) listener();
}

function patch(agentId: string, update: Partial<AgentChatSessionState>): void {
  const session = ensureSession(agentId);
  Object.assign(session, update);
  emit(agentId);
}

function makeLocalUserMessage(
  agentId: string,
  text: string,
  images: PendingImage[],
): Message {
  return {
    id: `local-${Date.now()}`,
    agentId,
    role: 'user',
    content: text || '(image attachment)',
    attachments: images.map((image) => ({
      id: image.id,
      type: 'image',
      mimeType: image.mimeType,
      name: image.name,
      path: '',
      url: image.previewUrl,
    })),
    metadata: {},
    createdAt: new Date().toISOString(),
  };
}

function invalidateChatQueries(queryClient: QueryClient, agentId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
  void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
  void queryClient.invalidateQueries({ queryKey: ['events', agentId] });
  void queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
  void queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
}

/**
 * Subscribe to a per-agent chat session that survives ChatPanel unmount
 * (agent sidebar toggles, Chat/Diff/Events tab switches).
 */
export function useAgentChatSession(agentId: string): AgentChatSessionState {
  return useSyncExternalStore(
    (listener) => {
      const session = ensureSession(agentId);
      session.listeners.add(listener);
      return () => {
        session.listeners.delete(listener);
      };
    },
    () => ensureSession(agentId).snapshot,
    () => EMPTY_STATE,
  );
}

export function reconcileOptimisticWithServer(agentId: string, serverMessages: Message[]): void {
  const session = ensureSession(agentId);
  const next = session.optimistic.filter((m) => {
    if (m.agentId !== agentId) return false;
    if (serverMessages.some((s) => s.id === m.id)) return false;
    if (m.id.startsWith('local-')) {
      return !serverMessages.some(
        (s) => s.role === 'user' && s.content === m.content && s.createdAt >= m.createdAt,
      );
    }
    return true;
  });
  if (next.length === session.optimistic.length) {
    const changed = next.some((m, i) => m !== session.optimistic[i]);
    if (!changed) return;
  }
  session.optimistic = next;
  emit(agentId);
}

export function setChatError(agentId: string, chatError: string | null): void {
  patch(agentId, { chatError });
}

export function setPermissionBusy(agentId: string, permissionBusy: boolean): void {
  patch(agentId, { permissionBusy });
}

export function setPermissionRequests(agentId: string, permissionRequests: PermissionRequest[]): void {
  patch(agentId, { permissionRequests });
}

export function removePermissionRequest(agentId: string, requestId: string): void {
  const session = ensureSession(agentId);
  session.permissionRequests = session.permissionRequests.filter(
    (item) => item.requestId !== requestId,
  );
  emit(agentId);
}

export function removeQueuedItem(agentId: string, id: string): void {
  const session = ensureSession(agentId);
  session.queue = session.queue.filter((item) => item.id !== id);
  emit(agentId);
}

export function resetChatSessionUi(agentId: string): void {
  const session = ensureSession(agentId);
  session.abort?.abort();
  session.abort = null;
  session.runId += 1;
  Object.assign(session, {
    ...EMPTY_STATE,
    optimistic: [],
    streamParts: [],
    queue: [],
    permissionRequests: [],
  });
  emit(agentId);
}

export async function stopAgentChat(agentId: string, queryClient: QueryClient): Promise<void> {
  const session = ensureSession(agentId);
  session.abort?.abort();
  session.abort = null;
  try {
    await api.stopAgent(agentId);
  } catch {
    // ignore
  }
  patch(agentId, { permissionRequests: [] });
  invalidateChatQueries(queryClient, agentId);
}

export async function runAgentChat(
  agentId: string,
  queryClient: QueryClient,
  text: string,
  images: PendingImage[],
  force: boolean,
  options: { archived: boolean } = { archived: false },
): Promise<void> {
  if (options.archived) return;

  const session = ensureSession(agentId);

  if (session.isStreaming && session.streamMode === 'chat' && !force) {
    const item: QueuedChatItem = {
      id: `q-${Date.now()}-${Math.random()}`,
      text,
      images,
    };
    session.queue = [...session.queue, item];
    emit(agentId);
    return;
  }

  if (session.isStreaming) {
    // Invalidate the previous run before abort so its finally cannot clear the next run.
    session.runId += 1;
    session.abort?.abort();
    if (session.streamMode === 'chat' || force) {
      try {
        await api.stopAgent(agentId);
      } catch {
        // best-effort interrupt
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const runId = session.runId + 1;
  session.runId = runId;
  const localUser = makeLocalUserMessage(agentId, text, images);
  const abort = new AbortController();
  session.abort = abort;
  session.chatError = null;
  session.lastFailed = null;
  session.streamParts = [];
  session.permissionRequests = [];
  session.isStreaming = true;
  session.streamMode = 'chat';
  session.optimistic = [...session.optimistic, localUser];
  emit(agentId);

  try {
    await streamChat(
      agentId,
      {
        message: text,
        force,
        images: images.map((image) => ({
          name: image.name,
          mimeType: image.mimeType,
          dataBase64: image.dataBase64,
        })),
      },
      {
        onUserMessage: (message) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          current.optimistic = [
            ...current.optimistic.filter((m) => m.id !== localUser.id),
            message,
          ];
          emit(agentId);
        },
        onToken: (token) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          current.streamParts = appendStreamText(current.streamParts, token);
          emit(agentId);
        },
        onEvent: (event) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          current.streamParts = applyStreamEvent(current.streamParts, event);
          emit(agentId);
        },
        onPermissionRequest: (request) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          if (current.permissionRequests.some((item) => item.requestId === request.requestId)) {
            return;
          }
          current.permissionRequests = [...current.permissionRequests, request];
          emit(agentId);
        },
        onDone: (payload) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          current.optimistic = [
            ...current.optimistic.filter(
              (m) => m.id !== localUser.id && m.id !== payload.message.id,
            ),
            payload.message,
          ];
          current.streamParts = [];
          current.permissionRequests = [];
          emit(agentId);
          invalidateChatQueries(queryClient, agentId);
        },
        onError: (err) => {
          if (ensureSession(agentId).runId !== runId) return;
          patch(agentId, {
            chatError: err,
            lastFailed: { text, images },
            streamParts: [],
          });
        },
      },
      abort.signal,
    );
  } catch (error) {
    if (ensureSession(agentId).runId === runId && (error as Error).name !== 'AbortError') {
      patch(agentId, {
        chatError: (error as Error).message,
        lastFailed: { text, images },
        streamParts: [],
      });
    } else if (ensureSession(agentId).runId === runId) {
      patch(agentId, { streamParts: [] });
    }
  } finally {
    const current = ensureSession(agentId);
    if (current.runId !== runId) return;

    current.isStreaming = false;
    current.streamMode = null;
    current.abort = null;
    emit(agentId);
    void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });

    const next = current.queue[0];
    if (next) {
      current.queue = current.queue.slice(1);
      emit(agentId);
      void runAgentChat(agentId, queryClient, next.text, next.images, false, options);
    }
  }
}

export async function buildApprovedPlanChat(
  agentId: string,
  queryClient: QueryClient,
  request: PermissionRequest,
  options: { archived: boolean } = { archived: false },
): Promise<void> {
  if (options.archived) return;

  const session = ensureSession(agentId);
  session.permissionBusy = true;
  session.chatError = null;
  emit(agentId);

  session.abort?.abort();
  // Invalidate any prior live/chat SSE before starting build.
  session.runId += 1;
  await new Promise((r) => setTimeout(r, 150));

  const plan = extractPlanFromInput(request.input);

  const runId = session.runId + 1;
  session.runId = runId;
  const abort = new AbortController();
  session.abort = abort;
  session.optimistic = [];
  session.queue = [];
  session.streamParts = [];
  session.permissionRequests = [];
  session.isStreaming = true;
  session.streamMode = 'chat';
  emit(agentId);

  try {
    await streamBuildPlan(
      agentId,
      { requestId: request.requestId, plan: plan || undefined },
      {
        onUserMessage: (message) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          current.optimistic = [...current.optimistic.filter((m) => m.id !== message.id), message];
          emit(agentId);
        },
        onToken: (token) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          current.streamParts = appendStreamText(current.streamParts, token);
          emit(agentId);
        },
        onEvent: (event) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          current.streamParts = applyStreamEvent(current.streamParts, event);
          emit(agentId);
        },
        onPermissionRequest: (nextRequest) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          if (
            current.permissionRequests.some((item) => item.requestId === nextRequest.requestId)
          ) {
            return;
          }
          current.permissionRequests = [...current.permissionRequests, nextRequest];
          emit(agentId);
        },
        onDone: (payload) => {
          if (ensureSession(agentId).runId !== runId) return;
          const current = ensureSession(agentId);
          current.optimistic = [
            ...current.optimistic.filter((m) => m.id !== payload.message.id),
            payload.message,
          ];
          current.streamParts = [];
          current.permissionRequests = [];
          emit(agentId);
          invalidateChatQueries(queryClient, agentId);
          void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
        },
        onError: (err) => {
          if (ensureSession(agentId).runId !== runId) return;
          patch(agentId, { chatError: err, streamParts: [] });
        },
      },
      abort.signal,
    );
  } catch (error) {
    if (ensureSession(agentId).runId === runId && (error as Error).name !== 'AbortError') {
      patch(agentId, { chatError: (error as Error).message, streamParts: [] });
    } else if (ensureSession(agentId).runId === runId) {
      patch(agentId, { streamParts: [] });
    }
  } finally {
    const current = ensureSession(agentId);
    if (current.runId !== runId) return;
    current.isStreaming = false;
    current.streamMode = null;
    current.abort = null;
    current.permissionBusy = false;
    emit(agentId);
    void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    void queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
  }
}

/**
 * If the agent is running on the server but this browser has no live SSE session
 * (page reload, or a prior abort-on-unmount), follow the run log to restore history.
 */
export function attachAgentLiveIfNeeded(
  agentId: string,
  queryClient: QueryClient,
  agentRunning: boolean,
): void {
  const session = ensureSession(agentId);
  if (!agentRunning || session.isStreaming) return;

  const runId = session.runId + 1;
  session.runId = runId;
  const abort = new AbortController();
  session.abort = abort;
  session.isStreaming = true;
  session.streamMode = 'live';
  session.streamParts = [];
  session.chatError = null;
  emit(agentId);

  void (async () => {
    try {
      await streamChatLive(
        agentId,
        {
          onToken: (token) => {
            if (ensureSession(agentId).runId !== runId) return;
            const current = ensureSession(agentId);
            current.streamParts = appendStreamText(current.streamParts, token);
            emit(agentId);
          },
          onEvent: (event) => {
            if (ensureSession(agentId).runId !== runId) return;
            const current = ensureSession(agentId);
            current.streamParts = applyStreamEvent(current.streamParts, event);
            emit(agentId);
          },
          onPermissionRequest: (request) => {
            if (ensureSession(agentId).runId !== runId) return;
            const current = ensureSession(agentId);
            if (current.permissionRequests.some((item) => item.requestId === request.requestId)) {
              return;
            }
            current.permissionRequests = [...current.permissionRequests, request];
            emit(agentId);
          },
          onDone: (payload) => {
            if (ensureSession(agentId).runId !== runId) return;
            const current = ensureSession(agentId);
            current.optimistic = [
              ...current.optimistic.filter((m) => m.id !== payload.message.id),
              payload.message,
            ];
            current.streamParts = [];
            current.permissionRequests = [];
            emit(agentId);
            invalidateChatQueries(queryClient, agentId);
          },
          onError: (err) => {
            if (ensureSession(agentId).runId !== runId) return;
            // Live follow is best-effort; don't surface as a hard chat failure.
            console.warn('Live chat follow error:', err);
            patch(agentId, { streamParts: [] });
          },
          onIdle: () => {
            if (ensureSession(agentId).runId !== runId) return;
            patch(agentId, { streamParts: [] });
            void queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
          },
        },
        abort.signal,
      );
    } catch (error) {
      if (ensureSession(agentId).runId === runId && (error as Error).name !== 'AbortError') {
        console.warn('Live chat follow failed:', error);
      }
    } finally {
      const current = ensureSession(agentId);
      if (current.runId !== runId) return;
      current.isStreaming = false;
      current.streamMode = null;
      current.abort = null;
      emit(agentId);
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
    }
  })();
}

/** Test helper — clears all in-memory sessions. */
export function __resetAgentChatSessionsForTests(): void {
  sessions.clear();
}
