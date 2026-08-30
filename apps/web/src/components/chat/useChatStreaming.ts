import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ChatSession,
  type Message,
  type PermissionRequest,
} from '@agent-orchestrator/shared';
import {
  api,
  streamChat,
} from '../../api/client';
import { useSseConnectionState } from '../../api/events';
import { SSE_FALLBACK_ACTIVE_POLL_MS } from '../../api/ssePolling';
import { createChatStreamHandlers } from './createChatStreamHandlers';
import { setMessagesCache } from './chatQueryCache';
import type { PendingImage } from './composerTypes';
import { pendingMentionToChatMention, createPendingMention, type PendingMention } from './mentionComposer';
import { createStreamingPatchBuffer } from './streamingPatchBuffer';
import type { QueuedChatItem } from './composerTypes';
import { useChatFollowStream } from './useChatFollowStream';
import { useChatSessionHandoffs } from './useChatSessionHandoffs';

interface UseChatStreamingOptions {
  agentId: string;
  activeSessionId: string;
  active: boolean;
  archived: boolean;
  session?: ChatSession;
  sessions: ChatSession[];
  sessionIdRef: React.MutableRefObject<string>;
  setSessionId: (id: string) => void;
  mountedRef: MutableRefObject<boolean>;
  isSending: boolean;
  abortRegistry: {
    abortBySessionRef: MutableRefObject<Map<string, AbortController>>;
    sendingSessionsRef: MutableRefObject<Set<string>>;
    followingRef: MutableRefObject<Set<string>>;
    beginSending: (id: string) => void;
    endSending: (id: string) => void;
    startSessionAbort: (id: string) => AbortController;
    releaseSessionAbort: (id: string, controller: AbortController) => void;
    setSendingSessionIds: Dispatch<SetStateAction<string[]>>;
  };
  setChatError: Dispatch<SetStateAction<string | null>>;
  setPermissionRequests: Dispatch<SetStateAction<PermissionRequest[]>>;
  setLastFailed: Dispatch<
    SetStateAction<{ text: string; images: PendingImage[]; mentions: PendingMention[] } | null>
  >;
  stickToBottom: () => void;
  initialPrompt?: string;
  initialImages?: PendingImage[];
  initialMentions?: PendingMention[];
  autoStartedRef: MutableRefObject<boolean>;
  messagesLoading: boolean;
  messagesData?: Message[];
}

export function useChatStreaming({
  agentId,
  activeSessionId,
  active,
  archived,
  session,
  sessions,
  sessionIdRef,
  setSessionId,
  mountedRef,
  isSending,
  abortRegistry,
  setChatError,
  setPermissionRequests,
  setLastFailed,
  stickToBottom,
  initialPrompt,
  initialImages,
  initialMentions,
  messagesLoading,
  messagesData,
}: UseChatStreamingOptions) {
  const queryClient = useQueryClient();
  const sseState = useSseConnectionState();
  const parentClaudeBySessionRef = useRef<Record<string, string>>({});
  const [compacting, setCompacting] = useState(false);
  const [stoppedSessionId, setStoppedSessionId] = useState<string | null>(null);
  const runChatRef = useRef<
    (
      text: string,
      images: PendingImage[],
      mentions: PendingMention[],
      force: boolean,
      sessionId?: string,
    ) => Promise<void>
  >(async () => undefined);

  const hasStreamingMessage = (messagesData ?? []).some((m) => m.metadata?.streaming);

  const queueQuery = useQuery({
    queryKey: ['queue', agentId, activeSessionId],
    queryFn: () => api.listQueuedMessages(agentId, activeSessionId),
    enabled: active && Boolean(activeSessionId),
    refetchInterval: (query) => {
      if (sseState === 'connected') return false;
      return session?.status === 'running' ||
        session?.status === 'queued' ||
        isSending ||
        (query.state.data?.length ?? 0) > 0
        ? SSE_FALLBACK_ACTIVE_POLL_MS
        : false;
    },
  });

  const queue: QueuedChatItem[] = (queueQuery.data ?? []).map((item) => ({
    id: item.id,
    text: item.content,
    images: [],
    mentions: (item.mentions ?? []).map((mention) => createPendingMention(mention)),
  }));

  const patchStreamingAssistant = (
    sid: string,
    messageId: string,
    mutate: (message: Message) => Message,
  ) => {
    setMessagesCache(queryClient, agentId, sid, (prev) => {
      if (!prev?.length) return prev ?? [];
      const index = prev.findIndex((item) => item.role === 'assistant' && item.id === messageId);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = mutate(next[index]!);
      return next;
    });
  };

  const streamingPatches = useMemo(
    () => createStreamingPatchBuffer(patchStreamingAssistant),
    [queryClient, agentId],
  );

  useEffect(() => () => streamingPatches.dispose(), [streamingPatches]);

  const viewed = (sid: string) => sid === sessionIdRef.current;

  const enqueueForSession = async (
    sid: string,
    text: string,
    images: PendingImage[],
    mentions: PendingMention[],
  ) => {
    try {
      await api.enqueueMessage(agentId, sid, {
        message: text,
        images: images.map((image) => ({
          name: image.name,
          mimeType: image.mimeType,
          dataBase64: image.dataBase64,
        })),
        mentions: mentions.map((mention) => pendingMentionToChatMention(mention)),
      });
    } catch (error) {
      if (sid === sessionIdRef.current) setChatError((error as Error).message);
    }
    queryClient.invalidateQueries({ queryKey: ['queue', agentId, sid] });
  };

  const makeHandlerContext = (
    stream: { sessionId: string },
    controller: AbortController,
    options: { invalidateSidebar?: boolean; reportError?: boolean } = {},
  ) =>
    createChatStreamHandlers({
      agentId,
      queryClient,
      mountedRef,
      sessionIdRef,
      parentClaudeBySessionRef,
      sessions,
      sendingSessionsRef: abortRegistry.sendingSessionsRef,
      abortBySessionRef: abortRegistry.abortBySessionRef,
      setSendingSessionIds: abortRegistry.setSendingSessionIds,
      setSessionId,
      setPermissionRequests,
      setChatError,
      streamingPatches,
      viewed,
      controller,
      stream,
      ...options,
    });

  const runChat = async (
    text: string,
    images: PendingImage[],
    mentions: PendingMention[],
    force: boolean,
    targetSessionId = sessionIdRef.current,
  ) => {
    if (archived || !mountedRef.current || !targetSessionId) return;

    const targetSession =
      sessions.find((item) => item.id === targetSessionId) ??
      (targetSessionId === activeSessionId ? session : undefined);
    const targetRunning = targetSession?.status === 'running';
    const targetWaiting = targetSession?.status === 'queued';
    const targetBusy =
      abortRegistry.sendingSessionsRef.current.has(targetSessionId) || targetRunning || targetWaiting;

    if (targetBusy && !force) {
      await enqueueForSession(targetSessionId, text, images, mentions);
      return;
    }

    if (targetRunning && force) {
      abortRegistry.abortBySessionRef.current.get(targetSessionId)?.abort();
      try {
        await api.stopSession(agentId, targetSessionId);
      } catch {
        // best-effort interrupt
      }
      await new Promise((r) => setTimeout(r, 200));
      if (!mountedRef.current) return;
    }

    if (viewed(targetSessionId)) {
      setChatError(null);
      setLastFailed(null);
      setPermissionRequests([]);
      setStoppedSessionId(null);
      stickToBottom();
    }

    const stream = { sessionId: targetSessionId };
    const controller = abortRegistry.startSessionAbort(targetSessionId);
    abortRegistry.beginSending(targetSessionId);

    const handlers = makeHandlerContext(stream, controller);
    const originalOnError = handlers.onError;
    handlers.onError = (err) => {
      if (viewed(stream.sessionId)) {
        setLastFailed({ text, images, mentions });
      }
      originalOnError(err);
    };

    try {
      await streamChat(
        agentId,
        stream.sessionId,
        {
          message: text,
          force,
          images: images.map((image) => ({
            name: image.name,
            mimeType: image.mimeType,
            dataBase64: image.dataBase64,
          })),
          mentions: mentions.map((mention) => pendingMentionToChatMention(mention)),
        },
        handlers,
        controller.signal,
      );
    } catch (error) {
      if (mountedRef.current && (error as Error).name !== 'AbortError') {
        if (viewed(stream.sessionId)) {
          setChatError((error as Error).message);
          setLastFailed({ text, images, mentions });
        }
      }
      if (mountedRef.current) {
        queryClient.invalidateQueries({ queryKey: ['messages', agentId, stream.sessionId] });
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['messages', agentId, stream.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['queue', agentId, stream.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['session-context', agentId, stream.sessionId] });
      abortRegistry.releaseSessionAbort(stream.sessionId, controller);
      abortRegistry.endSending(stream.sessionId);
    }
  };

  runChatRef.current = runChat;

  const { stopStreaming, buildPlan, compactAndContinue: runCompact } = useChatSessionHandoffs({
    agentId,
    archived,
    mountedRef,
    sessionIdRef,
    queryClient,
    abortRegistry,
    setChatError,
    setPermissionRequests,
    setStoppedSessionId,
    stickToBottom,
    makeHandlerContext,
    viewed,
  });

  const compactAndContinue = async () => {
    await runCompact(setCompacting, () => setStoppedSessionId(null));
  };

  useChatFollowStream({
    agentId,
    activeSessionId,
    active,
    archived,
    isSending,
    sessionRunning: session?.status === 'running',
    hasStreamingMessage,
    mountedRef,
    queryClient,
    followingRef: abortRegistry.followingRef,
    startSessionAbort: abortRegistry.startSessionAbort,
    releaseSessionAbort: abortRegistry.releaseSessionAbort,
    makeHandlerContext,
  });

  useEffect(() => {
    if (!initialPrompt || archived) return;
    if (messagesLoading) return;
    if ((messagesData?.length ?? 0) > 0) return;
    void runChatRef.current(initialPrompt, initialImages ?? [], initialMentions ?? [], false);
  }, [initialPrompt, initialImages, initialMentions, archived, messagesLoading, messagesData]);

  return {
    queue,
    runChat,
    runChatRef,
    stopStreaming,
    buildPlan,
    compactAndContinue,
    compacting,
    stoppedSessionId,
    hasStreamingMessage,
  };
}
