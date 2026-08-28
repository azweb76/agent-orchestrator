import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Fab,
  Stack,
  Tooltip,
} from '@mui/material';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  adoptParentClaudeSessionId,
  appendStreamText,
  applyStreamEvent,
  coalesceTimelineText,
  completeRunningTools,
  extractPlanFromInput,
  isSubagentItem,
  isTopLevelClaudeResult,
  mergeChatMessages,
  runningSubagentItems,
  parseAskUserQuestions,
  visibleAssistantContent,
  visibleSubagentItems,
  chatSessionTemplateById,
  type AgentDetail,
  type ChatSession,
  type ChatSessionTemplate,
  type ChatSessionTemplateId,
  type EffortLevel,
  type Message,
  type PermissionRequest,
  type UpdateChatSessionRequest,
} from '@agent-orchestrator/shared';
import {
  api,
  streamBuildPlan,
  streamChat,
  streamCompactSession,
  streamSessionFollow,
  type ChatStreamHandlers,
} from '../../api/client';
import { useVisualViewportInset } from '../../hooks/useVisualViewportInset';
import { ConfirmDialog } from '../ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { ChatBubble } from './ChatBubble';
import { CompactContinueBanner } from './CompactContinueBanner';
import { ChatComposer, type PendingImage, type QueuedChatItem } from './ChatComposer';
import { pendingMentionToChatMention, createPendingMention, type PendingMention } from './mentionComposer';
import { CONTEXT_SLASH_CHIP_COMMANDS } from './slashComposer';
import { ChatSessionBar } from './ChatSessionBar';
import { GradeSessionDialog } from './GradeSessionDialog';
import { ImproveInstructionsDialog } from './ImproveInstructionsDialog';
import { InstructionDraftOfferBanner } from './InstructionDraftOfferBanner';
import { ExitPlanModeCard } from './ExitPlanModeCard';
import { ToolPermissionCard } from './ToolPermissionCard';
import { SubagentActivityList, ThinkingIndicator, ToolProgressBar } from './ToolActivity';

const CHAT_COLUMN_MAX_WIDTH = 780;

interface ChatPanelProps {
  agent: AgentDetail;
  archived: boolean;
  /** When set on a fresh agent (e.g. from-idea), send as the first chat prompt. */
  initialPrompt?: string;
  /** When set, create a new session from this template after mount. */
  initialTemplate?: ChatSessionTemplateId;
}

/** Distance from the bottom (px) still treated as "stuck" for auto-scroll. */
const NEAR_BOTTOM_PX = 80;

function isNearBottom(el: HTMLElement, thresholdPx = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

function upsertMessage(messages: Message[] | undefined, message: Message): Message[] {
  if (!messages?.length) return [message];
  const index = messages.findIndex((item) => item.id === message.id);
  if (index < 0) return [...messages, message];
  const next = [...messages];
  next[index] = message;
  return next;
}

function setMessagesCache(
  queryClient: QueryClient,
  agentId: string,
  sessionId: string,
  updater: (prev: Message[] | undefined) => Message[],
): void {
  queryClient.setQueryData<Message[]>(['messages', agentId, sessionId], (prev) => updater(prev));
}

/**
 * Fold a live stream event into the streaming assistant message. A top-level
 * `result` only ends the visual stream when no background Task/Explore
 * subagent is still running: the backend keeps that run open and wakes Claude
 * when the task settles, and later events can only be applied while the local
 * copy is still marked streaming (`patchStreamingAssistant` skips completed
 * messages, and a completed local copy wins over the server's still-streaming
 * snapshot in `mergeChatMessages`).
 */
function applyEventToAssistant(
  message: Message,
  event: Record<string, unknown>,
  parentSessionId: string | null,
): Message {
  const timeline = applyStreamEvent(message.metadata.timeline ?? [], event, parentSessionId);
  const turnEnded =
    isTopLevelClaudeResult(event, parentSessionId) && runningSubagentItems(timeline).length === 0;
  return {
    ...message,
    metadata: {
      ...message.metadata,
      streaming: !turnEnded,
      timeline,
    },
  };
}

function upsertAgentSession(
  queryClient: QueryClient,
  agentId: string,
  session: ChatSession,
  options: { activate?: boolean } = {},
): void {
  queryClient.setQueryData<AgentDetail>(['agent', agentId], (prev) => {
    if (!prev) return prev;
    const sessions = prev.sessions ?? [];
    const has = sessions.some((item) => item.id === session.id);
    return {
      ...prev,
      ...(options.activate ? { activeSessionId: session.id } : {}),
      sessions: has
        ? sessions.map((item) => (item.id === session.id ? { ...item, ...session } : item))
        : [...sessions, session],
    };
  });
  if (session.status === 'queued') {
    queryClient.invalidateQueries({ queryKey: ['queue', agentId, session.id] });
  }
}

function MessageTimeline({ message, onRetry }: { message: Message; onRetry?: () => void }) {
  const streaming = Boolean(message.metadata?.streaming);
  const timeline = message.metadata?.timeline ?? [];
  const parts = streaming ? timeline : completeRunningTools(timeline);
  const toolItems = parts.filter(
    (part): part is Extract<(typeof parts)[number], { type: 'tool' }> =>
      part.type === 'tool',
  );
  // Live timeline so parent Ready does not force-complete running Task rows.
  const subagents = visibleSubagentItems(timeline, streaming);
  const otherTools = toolItems.filter((item) => !isSubagentItem(item));
  const otherRunning = otherTools.some((item) => item.status === 'running');
  const lastPart = parts[parts.length - 1];
  const showSubagents = subagents.length > 0;
  const showToolProgress =
    streaming &&
    otherTools.length > 0 &&
    (otherRunning || (lastPart?.type === 'tool' && !isSubagentItem(lastPart)));
  // One bubble per assistant turn — never split text across tool boundaries.
  const rawContent = visibleAssistantContent(message.content);
  const textContent = rawContent || coalesceTimelineText(parts);
  const showText = Boolean(textContent);
  const showThinking = streaming && !showText && !showToolProgress && !showSubagents;

  return (
    <Box sx={{ mb: 2 }}>
      <ChatBubble
        gutter={false}
        hideBody={!showText && streaming}
        streaming={streaming}
        cursor={streaming && showText && !showToolProgress && !showSubagents}
        message={{
          ...message,
          content: textContent,
          metadata: {
            costUsd: message.metadata?.costUsd,
            durationMs: message.metadata?.durationMs,
            stopped: message.metadata?.stopped,
            error: message.metadata?.error,
          },
        }}
        onCopy={() => void navigator.clipboard.writeText(textContent)}
        onRetry={onRetry}
      />
      {showThinking ? <ThinkingIndicator /> : null}
      {showSubagents ? (
        <SubagentActivityList items={subagents} />
      ) : null}
      {showToolProgress ? <ToolProgressBar items={otherTools} /> : null}
    </Box>
  );
}

export function ChatPanel({ agent, archived, initialPrompt, initialTemplate }: ChatPanelProps) {
  const agentId = agent.id;
  const keyboardInset = useVisualViewportInset();
  const queryClient = useQueryClient();
  const sessions = agent.sessions ?? [];
  const [sessionId, setSessionId] = useState(
    () => agent.activeSessionId ?? sessions[0]?.id ?? '',
  );
  const session: ChatSession | undefined =
    sessions.find((item) => item.id === sessionId) ?? sessions[0];
  const activeSessionId = session?.id ?? sessionId;
  const [draft, setDraft] = useState('');
  const [sendingSessionIds, setSendingSessionIds] = useState<string[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<Message | null>(null);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [lastFailed, setLastFailed] = useState<{
    text: string;
    images: PendingImage[];
    mentions: PendingMention[];
  } | null>(
    null,
  );
  const abortBySessionRef = useRef(new Map<string, AbortController>());
  const parentClaudeBySessionRef = useRef<Record<string, string>>({});
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const sendingSessionsRef = useRef(new Set<string>());
  const followingRef = useRef(new Set<string>());
  // Bumped whenever a follow stream settles so the effect re-evaluates and can
  // re-attach when the backend still reports the session running (its deps
  // alone do not change when a stream drops mid-run).
  const [followEpoch, setFollowEpoch] = useState(0);
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);
  const sessionIdRef = useRef(activeSessionId);
  const activationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestActivationRef = useRef(0);
  const [creatingSession, setCreatingSession] = useState(false);
  const [compacting, setCompacting] = useState(false);
  /** Session whose last run the user stopped (offers compact while the meter is hot). */
  const [stoppedSessionId, setStoppedSessionId] = useState<string | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [improveOpen, setImproveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const runChatRef = useRef<
    (
      text: string,
      images: PendingImage[],
      mentions: PendingMention[],
      force: boolean,
      sessionId?: string,
    ) => Promise<void>
  >(async () => undefined);

  sessionIdRef.current = activeSessionId;
  const isSending = sendingSessionIds.includes(activeSessionId);

  const beginSending = (id: string) => {
    sendingSessionsRef.current.add(id);
    setSendingSessionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  const endSending = (id: string) => {
    sendingSessionsRef.current.delete(id);
    setSendingSessionIds((prev) => prev.filter((item) => item !== id));
  };
  const startSessionAbort = (id: string) => {
    abortBySessionRef.current.get(id)?.abort();
    const controller = new AbortController();
    abortBySessionRef.current.set(id, controller);
    return controller;
  };
  const releaseSessionAbort = (id: string, controller: AbortController) => {
    if (abortBySessionRef.current.get(id) === controller) {
      abortBySessionRef.current.delete(id);
    }
  };

  // Queued follow-ups are persisted server-side and drained by the server when
  // the running reply finishes (even if this browser tab closes).
  const queueQuery = useQuery({
    queryKey: ['queue', agentId, activeSessionId],
    queryFn: () => api.listQueuedMessages(agentId, activeSessionId),
    enabled: Boolean(activeSessionId),
    refetchInterval: (query) =>
      session?.status === 'running' ||
      session?.status === 'queued' ||
      isSending ||
      (query.state.data?.length ?? 0) > 0
        ? 2000
        : false,
  });
  const queue: QueuedChatItem[] = (queueQuery.data ?? []).map((item) => ({
    id: item.id,
    text: item.content,
    images: [],
    mentions: (item.mentions ?? []).map((mention) => createPendingMention(mention)),
  }));

  const messagesQuery = useQuery({
    queryKey: ['messages', agentId, activeSessionId],
    queryFn: async () => {
      const remote = await api.getMessages(agentId, activeSessionId);
      const local = queryClient.getQueryData<Message[]>(['messages', agentId, activeSessionId]);
      return mergeChatMessages(local, remote);
    },
    enabled: Boolean(activeSessionId),
    refetchOnWindowFocus: true,
    refetchInterval: () => {
      if (sendingSessionsRef.current.has(activeSessionId)) return false;
      if (followingRef.current.has(activeSessionId)) return false;
      const cached = queryClient.getQueryData<Message[]>(['messages', agentId, activeSessionId]);
      const streaming = cached?.some((item) => item.metadata?.streaming);
      if (session?.status === 'running' || streaming || queue.length > 0) return 1000;
      return false;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateChatSessionRequest) =>
      api.updateSession(agentId, activeSessionId, body),
    onSuccess: (updated) => {
      upsertAgentSession(queryClient, agentId, updated);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const renameSessionMutation = useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      api.updateSession(agentId, sessionId, { title }),
    onMutate: ({ sessionId, title }) => {
      queryClient.setQueryData<AgentDetail>(['agent', agentId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: (prev.sessions ?? []).map((item) =>
            item.id === sessionId ? { ...item, title, titleSource: 'user' } : item,
          ),
        };
      });
    },
    onSuccess: (updated) => {
      upsertAgentSession(queryClient, agentId, updated);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
    onError: (error) => {
      setChatError((error as Error).message);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearMessages(agentId, activeSessionId),
    onSuccess: () => {
      setClearOpen(false);
      setPermissionRequests([]);
      setChatError(null);
      setLastFailed(null);
      // Drop stale optimistic/SSE messages before refetch — mergeChatMessages keeps
      // local-only ids, so an empty remote would otherwise resurrect the old transcript.
      setMessagesCache(queryClient, agentId, activeSessionId, () => []);
      queryClient.invalidateQueries({ queryKey: ['queue', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['messages', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const rewindMutation = useMutation({
    mutationFn: (messageId: string) => api.rewindMessages(agentId, activeSessionId, messageId),
    onSuccess: (result, messageId) => {
      setRewindTarget(null);
      setPermissionRequests([]);
      setChatError(null);
      setLastFailed(null);
      setDraft(result.draft);
      setMessagesCache(queryClient, agentId, activeSessionId, (prev) => {
        if (!prev?.length) return [];
        const index = prev.findIndex((item) => item.id === messageId);
        if (index < 0) return prev;
        return prev.slice(0, index);
      });
      queryClient.invalidateQueries({ queryKey: ['queue', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['messages', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (target: ChatSession) => api.deleteSession(agentId, target.id),
    onSuccess: (detail, target) => {
      abortBySessionRef.current.get(target.id)?.abort();
      abortBySessionRef.current.delete(target.id);
      endSending(target.id);
      setDeleteTarget(null);
      setPermissionRequests([]);
      setChatError(null);
      setLastFailed(null);
      const nextId = detail.activeSessionId ?? detail.sessions[0]?.id ?? '';
      sessionIdRef.current = nextId;
      setSessionId(nextId);
      queryClient.setQueryData(['agent', agentId], detail);
      queryClient.removeQueries({ queryKey: ['messages', agentId, target.id] });
      queryClient.removeQueries({ queryKey: ['permissions', agentId, target.id] });
      queryClient.removeQueries({ queryKey: ['queue', agentId, target.id] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const gradeMutation = useMutation({
    mutationFn: (body: { notes?: string } = {}) => api.gradeSession(agentId, activeSessionId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const hasStreamingMessage = (messagesQuery.data ?? []).some((m) => m.metadata?.streaming);
  const sessionBusy = session?.status === 'running' || isSending || hasStreamingMessage;

  const pendingPermissionsQuery = useQuery({
    queryKey: ['permissions', agentId, activeSessionId],
    queryFn: () => api.listPendingPermissions(agentId, activeSessionId),
    enabled: Boolean(activeSessionId) && (sessionBusy || permissionRequests.length > 0),
    refetchInterval: () => (sessionBusy || permissionRequests.length > 0 ? 2000 : false),
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Aborting only drops the UI SSE subscription — the backend keeps the run
      // and continues persisting chat history.
      for (const controller of abortBySessionRef.current.values()) {
        controller.abort();
      }
      abortBySessionRef.current.clear();
      sendingSessionsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const remote = pendingPermissionsQuery.data;
    if (remote === undefined) return;
    // Prefer the server list. If a poll returns empty while SSE already showed a
    // prompt and the stream is still open, keep the local cards until the next
    // non-empty poll or the stream ends.
    setPermissionRequests((prev) => {
      if (remote.length === 0 && isSending && prev.length > 0) return prev;
      return remote;
    });
  }, [pendingPermissionsQuery.data, isSending]);

  useEffect(() => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }, [agentId, activeSessionId]);

  useEffect(() => {
    setPermissionRequests([]);
    setChatError(null);
    setLastFailed(null);
  }, [activeSessionId]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    // Instant scroll keeps stick-to-bottom accurate; smooth scrollIntoView can
    // fire onScroll mid-animation and clear the near-bottom flag.
    el.scrollTop = el.scrollHeight;
  }, [messagesQuery.data, permissionRequests]);

  const handleChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    stickToBottomRef.current = near;
    setShowJumpToLatest(!near);
  };

  const jumpToLatest = () => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const displayMessages = messagesQuery.data ?? [];

  useEffect(() => {
    const root = chatScrollRef.current;
    const target = bottomSentinelRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const near = Boolean(entry?.isIntersecting);
        stickToBottomRef.current = near;
        setShowJumpToLatest(!near && root.scrollHeight - root.clientHeight > NEAR_BOTTOM_PX);
      },
      { root, threshold: 0.01, rootMargin: '0px 0px 80px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [agentId, activeSessionId, displayMessages.length, permissionRequests.length, messagesQuery.isLoading]);

  const patchStreamingAssistant = (
    sid: string,
    mutate: (message: Message) => Message,
  ) => {
    setMessagesCache(queryClient, agentId, sid, (prev) => {
      if (!prev?.length) return prev ?? [];
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        const item = next[i]!;
        if (item.role === 'assistant' && item.metadata?.streaming) {
          next[i] = mutate(item);
          break;
        }
      }
      return next;
    });
  };

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

  const viewed = (sid: string) => sid === sessionIdRef.current;

  const parentSessionForEvent = (chatSessionId: string, event: Record<string, unknown>): string | null => {
    const stored =
      parentClaudeBySessionRef.current[chatSessionId] ??
      sessions.find((item) => item.id === chatSessionId)?.claudeSessionId ??
      null;
    const next = adoptParentClaudeSessionId(stored, event);
    if (next) parentClaudeBySessionRef.current[chatSessionId] = next;
    return next;
  };

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
      sendingSessionsRef.current.has(targetSessionId) || targetRunning || targetWaiting;

    if (targetBusy && !force) {
      await enqueueForSession(targetSessionId, text, images, mentions);
      return;
    }

    if (targetRunning && force) {
      abortBySessionRef.current.get(targetSessionId)?.abort();
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
      stickToBottomRef.current = true;
      setShowJumpToLatest(false);
    }

    const stream = { sessionId: targetSessionId };
    const controller = startSessionAbort(targetSessionId);
    beginSending(targetSessionId);

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
        {
          onSession: (nextSession) => {
            if (!mountedRef.current) return;
            const previousId = stream.sessionId;
            const switched = nextSession.id !== previousId;
            if (switched) {
              if (abortBySessionRef.current.get(previousId) === controller) {
                abortBySessionRef.current.delete(previousId);
              }
              abortBySessionRef.current.set(nextSession.id, controller);
              sendingSessionsRef.current.delete(previousId);
              sendingSessionsRef.current.add(nextSession.id);
              setSendingSessionIds((prev) => {
                const without = prev.filter((id) => id !== previousId);
                return without.includes(nextSession.id) ? without : [...without, nextSession.id];
              });
              stream.sessionId = nextSession.id;
              sessionIdRef.current = nextSession.id;
              setSessionId(nextSession.id);
            }
            upsertAgentSession(queryClient, agentId, nextSession, { activate: switched });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
          },
          onUserMessage: (message) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, stream.sessionId, (prev) =>
              upsertMessage(prev, message),
            );
          },
          onAssistantMessage: (message) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, stream.sessionId, (prev) =>
              upsertMessage(prev, message),
            );
          },
          onToken: (token) => {
            if (!mountedRef.current) return;
            patchStreamingAssistant(stream.sessionId, (message) => ({
              ...message,
              content: message.content + token,
              metadata: {
                ...message.metadata,
                streaming: true,
                timeline: appendStreamText(message.metadata.timeline ?? [], token),
              },
            }));
          },
          onEvent: (event) => {
            if (!mountedRef.current) return;
            const parentSessionId = parentSessionForEvent(stream.sessionId, event);
            patchStreamingAssistant(stream.sessionId, (message) =>
              applyEventToAssistant(message, event, parentSessionId),
            );
          },
          onPermissionRequest: (request) => {
            if (!mountedRef.current || !viewed(stream.sessionId)) return;
            setPermissionRequests((prev) => {
              if (prev.some((item) => item.requestId === request.requestId)) return prev;
              return [...prev, request];
            });
          },
          onDone: (payload) => {
            if (!mountedRef.current) return;
            const sid = payload.chatSessionId ?? stream.sessionId;
            void queryClient.cancelQueries({ queryKey: ['messages', agentId, sid] });
            setMessagesCache(queryClient, agentId, sid, (prev) =>
              upsertMessage(prev, payload.message),
            );
            void queryClient
              .invalidateQueries({ queryKey: ['permissions', agentId, sid] })
              .then(() => api.listPendingPermissions(agentId, sid))
              .then((pending) => {
                if (mountedRef.current && viewed(sid)) setPermissionRequests(pending);
              })
              .catch(() => {
                if (mountedRef.current && viewed(sid)) setPermissionRequests([]);
              });
            queryClient.invalidateQueries({ queryKey: ['messages', agentId, sid] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
          },
          onError: (err) => {
            if (!mountedRef.current) return;
            if (viewed(stream.sessionId)) {
              setChatError(err);
              setLastFailed({ text, images, mentions });
            }
            queryClient.invalidateQueries({
              queryKey: ['messages', agentId, stream.sessionId],
            });
          },
        },
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
      // The server drains any queued follow-ups itself once the run finishes.
      void queryClient.invalidateQueries({ queryKey: ['messages', agentId, stream.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['queue', agentId, stream.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['session-context', agentId, stream.sessionId] });
      releaseSessionAbort(stream.sessionId, controller);
      endSending(stream.sessionId);
    }
  };

  runChatRef.current = runChat;

  // Re-attach to a backend run this tab is not currently POSTing (reload, Changes
  // tab, queued drain, dropped SSE). Live tokens keep the composer in sync.
  useEffect(() => {
    if (archived || !activeSessionId) return;
    if (isSending) return;
    if (session?.status !== 'running' && !hasStreamingMessage) return;

    const sid = activeSessionId;
    const stream = { sessionId: sid };
    const controller = startSessionAbort(sid);
    followingRef.current.add(sid);

    const handlers: ChatStreamHandlers = {
      onSession: (nextSession) => {
        if (!mountedRef.current) return;
        const previousId = stream.sessionId;
        const switched = nextSession.id !== previousId;
        if (switched) {
          stream.sessionId = nextSession.id;
          sessionIdRef.current = nextSession.id;
          setSessionId(nextSession.id);
        }
        upsertAgentSession(queryClient, agentId, nextSession, { activate: switched });
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      },
      onUserMessage: (message) => {
        if (!mountedRef.current) return;
        setMessagesCache(queryClient, agentId, stream.sessionId, (prev) =>
          upsertMessage(prev, message),
        );
      },
      onAssistantMessage: (message) => {
        if (!mountedRef.current) return;
        setMessagesCache(queryClient, agentId, stream.sessionId, (prev) =>
          upsertMessage(prev, message),
        );
      },
      onToken: (token) => {
        if (!mountedRef.current) return;
        patchStreamingAssistant(stream.sessionId, (message) => ({
          ...message,
          content: message.content + token,
          metadata: {
            ...message.metadata,
            streaming: true,
            timeline: appendStreamText(message.metadata.timeline ?? [], token),
          },
        }));
      },
      onEvent: (event) => {
        if (!mountedRef.current) return;
        const parentSessionId = parentSessionForEvent(stream.sessionId, event);
        patchStreamingAssistant(stream.sessionId, (message) =>
          applyEventToAssistant(message, event, parentSessionId),
        );
      },
      onPermissionRequest: (request) => {
        if (!mountedRef.current || !viewed(stream.sessionId)) return;
        setPermissionRequests((prev) => {
          if (prev.some((item) => item.requestId === request.requestId)) return prev;
          return [...prev, request];
        });
      },
      onDone: (payload) => {
        if (!mountedRef.current) return;
        const doneSid = payload.chatSessionId ?? stream.sessionId;
        void queryClient.cancelQueries({ queryKey: ['messages', agentId, doneSid] });
        setMessagesCache(queryClient, agentId, doneSid, (prev) =>
          upsertMessage(prev, payload.message),
        );
        void queryClient
          .invalidateQueries({ queryKey: ['permissions', agentId, doneSid] })
          .then(() => api.listPendingPermissions(agentId, doneSid))
          .then((pending) => {
            if (mountedRef.current && viewed(doneSid)) setPermissionRequests(pending);
          })
          .catch(() => {
            if (mountedRef.current && viewed(doneSid)) setPermissionRequests([]);
          });
        queryClient.invalidateQueries({ queryKey: ['messages', agentId, doneSid] });
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
        queryClient.invalidateQueries({ queryKey: ['events', agentId] });
        queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
        queryClient.invalidateQueries({ queryKey: ['queue', agentId, doneSid] });
      },
      onError: () => {
        if (!mountedRef.current) return;
        queryClient.invalidateQueries({ queryKey: ['messages', agentId, stream.sessionId] });
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      },
    };

    void streamSessionFollow(agentId, sid, handlers, controller.signal)
      .catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') return;
        if (mountedRef.current) {
          queryClient.invalidateQueries({ queryKey: ['messages', agentId, sid] });
          queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
        }
      })
      .finally(() => {
        followingRef.current.delete(sid);
        releaseSessionAbort(sid, controller);
        // Re-evaluate shortly after the stream settles: if the session is
        // still running (dropped SSE, proxy timeout), the effect re-attaches;
        // otherwise its guards make this a no-op.
        window.setTimeout(() => {
          if (mountedRef.current) setFollowEpoch((n) => n + 1);
        }, 1_000);
      });

    return () => {
      followingRef.current.delete(sid);
      controller.abort();
    };
    // createLiveHandlers closes over the latest patch helpers; session status
    // and the local send flag decide when a follow subscription is needed.
  }, [archived, agentId, activeSessionId, isSending, session?.status, hasStreamingMessage, followEpoch]);

  // From-idea: auto-send the idea as the first plan-mode prompt once messages load empty.
  useEffect(() => {
    if (!initialPrompt || archived || autoStartedRef.current) return;
    if (messagesQuery.isLoading) return;
    if ((messagesQuery.data?.length ?? 0) > 0) {
      autoStartedRef.current = true;
      return;
    }
    autoStartedRef.current = true;
    void runChatRef.current(initialPrompt, [], [], false);
  }, [initialPrompt, archived, messagesQuery.isLoading, messagesQuery.data]);

  const stopStreaming = async () => {
    const sid = sessionIdRef.current;
    abortBySessionRef.current.get(sid)?.abort();
    try {
      await api.stopSession(agentId, sid);
    } catch {
      // ignore
    }
    setStoppedSessionId(sid);
    setPermissionRequests([]);
    queryClient.invalidateQueries({ queryKey: ['messages', agentId, sid] });
    queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sid] });
    queryClient.invalidateQueries({ queryKey: ['session-context', agentId, sid] });
  };

  const removePermission = (requestId: string) => {
    setPermissionRequests((prev) => prev.filter((item) => item.requestId !== requestId));
  };

  const submitAnswers = async (
    request: PermissionRequest,
    answers: Record<string, string>,
    response?: string,
  ) => {
    setPermissionBusy(true);
    setChatError(null);
    try {
      await api.answerPermission(agentId, sessionIdRef.current, {
        requestId: request.requestId,
        answers,
        response,
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const keepPlanning = async (request: PermissionRequest) => {
    setPermissionBusy(true);
    setChatError(null);
    // Drop the UI SSE subscription; the backend stops the hung ExitPlanMode run.
    abortBySessionRef.current.get(sessionIdRef.current)?.abort();
    try {
      await api.denyPermission(agentId, sessionIdRef.current, {
        requestId: request.requestId,
        message: 'User wants to keep planning. Revise the plan based on further feedback.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['messages', agentId, sessionIdRef.current] });
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  /** Skip AskUserQuestion with an allow+response so Claude continues (deny can stall the tool). */
  const skipAskUserQuestion = async (request: PermissionRequest) => {
    setPermissionBusy(true);
    setChatError(null);
    try {
      await api.answerPermission(agentId, sessionIdRef.current, {
        requestId: request.requestId,
        answers: {},
        response:
          'User skipped these questions. Continue with sensible defaults and ask again only if blocked.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const allowTool = async (request: PermissionRequest) => {
    setPermissionBusy(true);
    setChatError(null);
    try {
      await api.allowPermission(agentId, sessionIdRef.current, { requestId: request.requestId });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const denyTool = async (request: PermissionRequest) => {
    setPermissionBusy(true);
    setChatError(null);
    try {
      await api.denyPermission(agentId, sessionIdRef.current, {
        requestId: request.requestId,
        message: 'User denied this tool request.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  /**
   * Run a handoff stream that stashes the current session and switches the UI
   * to a server-created replacement (Build, compact-and-continue).
   */
  const runSessionHandoff = async (
    start: (
      fromSessionId: string,
      handlers: ChatStreamHandlers,
      signal: AbortSignal,
    ) => Promise<void>,
  ) => {
    if (archived || !mountedRef.current) return;
    const fromSessionId = sessionIdRef.current;
    setChatError(null);

    abortBySessionRef.current.get(fromSessionId)?.abort();
    await new Promise((r) => setTimeout(r, 150));
    if (!mountedRef.current) return;

    // The server drops queued follow-ups on the stashed session.
    queryClient.invalidateQueries({ queryKey: ['queue', agentId, fromSessionId] });
    setPermissionRequests([]);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);

    const stream = { sessionId: fromSessionId };
    const controller = startSessionAbort(fromSessionId);
    beginSending(fromSessionId);

    try {
      await start(
        fromSessionId,
        {
          onSession: (nextSession) => {
            if (!mountedRef.current) return;
            const previousId = stream.sessionId;
            const switched = nextSession.id !== previousId;
            if (switched) {
              if (abortBySessionRef.current.get(previousId) === controller) {
                abortBySessionRef.current.delete(previousId);
              }
              abortBySessionRef.current.set(nextSession.id, controller);
              sendingSessionsRef.current.delete(previousId);
              sendingSessionsRef.current.add(nextSession.id);
              setSendingSessionIds((prev) => {
                const without = prev.filter((id) => id !== previousId);
                return without.includes(nextSession.id) ? without : [...without, nextSession.id];
              });
              stream.sessionId = nextSession.id;
              sessionIdRef.current = nextSession.id;
              setSessionId(nextSession.id);
            }
            upsertAgentSession(queryClient, agentId, nextSession, { activate: switched });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['sidebar'] });
          },
          onUserMessage: (message) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, stream.sessionId, (prev) =>
              upsertMessage(prev, message),
            );
          },
          onAssistantMessage: (message) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, stream.sessionId, (prev) =>
              upsertMessage(prev, message),
            );
          },
          onToken: (token) => {
            if (!mountedRef.current) return;
            patchStreamingAssistant(stream.sessionId, (message) => ({
              ...message,
              content: message.content + token,
              metadata: {
                ...message.metadata,
                streaming: true,
                timeline: appendStreamText(message.metadata.timeline ?? [], token),
              },
            }));
          },
          onEvent: (event) => {
            if (!mountedRef.current) return;
            const parentSessionId = parentSessionForEvent(stream.sessionId, event);
            patchStreamingAssistant(stream.sessionId, (message) =>
              applyEventToAssistant(message, event, parentSessionId),
            );
          },
          onPermissionRequest: (nextRequest) => {
            if (!mountedRef.current || !viewed(stream.sessionId)) return;
            setPermissionRequests((prev) => {
              if (prev.some((item) => item.requestId === nextRequest.requestId)) return prev;
              return [...prev, nextRequest];
            });
          },
          onDone: (payload) => {
            if (!mountedRef.current) return;
            const sid = payload.chatSessionId ?? stream.sessionId;
            void queryClient.cancelQueries({ queryKey: ['messages', agentId, sid] });
            setMessagesCache(queryClient, agentId, sid, (prev) =>
              upsertMessage(prev, payload.message),
            );
            void queryClient
              .invalidateQueries({ queryKey: ['permissions', agentId, sid] })
              .then(() => api.listPendingPermissions(agentId, sid))
              .then((pending) => {
                if (mountedRef.current && viewed(sid)) setPermissionRequests(pending);
              })
              .catch(() => {
                if (mountedRef.current && viewed(sid)) setPermissionRequests([]);
              });
            queryClient.invalidateQueries({ queryKey: ['messages', agentId, sid] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
            queryClient.invalidateQueries({ queryKey: ['sidebar'] });
          },
          onError: (err) => {
            if (!mountedRef.current) return;
            if (viewed(stream.sessionId)) setChatError(err);
            queryClient.invalidateQueries({
              queryKey: ['messages', agentId, stream.sessionId],
            });
          },
        },
        controller.signal,
      );
    } catch (error) {
      if (mountedRef.current && (error as Error).name !== 'AbortError' && viewed(stream.sessionId)) {
        setChatError((error as Error).message);
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['messages', agentId, stream.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['session-context', agentId, stream.sessionId] });
      releaseSessionAbort(stream.sessionId, controller);
      endSending(stream.sessionId);
    }
  };

  const buildPlan = async (request: PermissionRequest) => {
    if (archived || !mountedRef.current) return;
    setPermissionBusy(true);
    const plan = extractPlanFromInput(request.input);
    try {
      await runSessionHandoff((fromSessionId, handlers, signal) =>
        streamBuildPlan(
          agentId,
          fromSessionId,
          { requestId: request.requestId, plan: plan || undefined },
          handlers,
          signal,
        ),
      );
    } finally {
      if (mountedRef.current) setPermissionBusy(false);
    }
  };

  /** Compact-and-continue: summarize the hot session and continue in a fresh one. */
  const compactAndContinue = async () => {
    if (archived || !mountedRef.current) return;
    setCompacting(true);
    setStoppedSessionId(null);
    try {
      await runSessionHandoff((fromSessionId, handlers, signal) =>
        streamCompactSession(agentId, fromSessionId, handlers, signal),
      );
    } finally {
      if (mountedRef.current) setCompacting(false);
    }
  };

  const requestClear = () => setClearOpen(true);

  const requestRewind = (message: Message) => {
    if (archived || sessionBusy) return;
    setRewindTarget(message);
  };

  const requestRewindLast = () => {
    const lastUser = [...displayMessages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      setChatError('Nothing to rewind — send a message first.');
      return;
    }
    requestRewind(lastUser);
  };

  const selectSession = async (id: string) => {
    if (id === activeSessionId) return;
    setSessionId(id);
    sessionIdRef.current = id;
    latestActivationRef.current += 1;
    const activation = latestActivationRef.current;
    // The endpoint persists the active session. Serialize requests so A → B
    // cannot finish in reverse order and leave A active after a reload.
    const request = activationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const detail = await api.activateSession(agentId, id);
        if (!mountedRef.current || activation !== latestActivationRef.current) return;
        queryClient.setQueryData(['agent', agentId], detail);
      });
    activationQueueRef.current = request;
    try {
      await request;
    } catch (error) {
      if (mountedRef.current && activation === latestActivationRef.current) {
        setChatError((error as Error).message);
      }
    }
  };

  const createSessionFromTemplate = async (template: ChatSessionTemplate) => {
    if (archived) return;
    setCreatingSession(true);
    setChatError(null);
    try {
      const result = await api.createSession(agentId, { template: template.id });
      upsertAgentSession(queryClient, agentId, result.session, { activate: true });
      sessionIdRef.current = result.session.id;
      setSessionId(result.session.id);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      if (result.kickoffPrompt) {
        void runChatRef.current(result.kickoffPrompt, [], [], false, result.session.id);
      }
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setCreatingSession(false);
    }
  };

  useEffect(() => {
    if (!initialTemplate || archived || autoStartedRef.current) return;
    const template = chatSessionTemplateById(initialTemplate);
    if (!template) return;
    autoStartedRef.current = true;
    void createSessionFromTemplate(template);
  }, [archived, initialTemplate]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      <ChatSessionBar
        sessions={sessions}
        activeSessionId={activeSessionId || null}
        disabled={archived}
        creating={creatingSession}
        onSelect={(id) => void selectSession(id)}
        onCreate={(template) => void createSessionFromTemplate(template)}
        onDelete={archived ? undefined : (target) => setDeleteTarget(target)}
        onRename={
          archived
            ? undefined
            : (target, title) => renameSessionMutation.mutate({ sessionId: target.id, title })
        }
      />
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <Box
          ref={chatScrollRef}
          onScroll={handleChatScroll}
          sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
        >
          <Box
            sx={{
              maxWidth: CHAT_COLUMN_MAX_WIDTH,
              mx: 'auto',
              px: { xs: 1.5, sm: 2.5 },
              py: { xs: 1.5, sm: 2 },
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {messagesQuery.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={28} />
              </Box>
            ) : messagesQuery.error ? (
              <Alert severity="error">{(messagesQuery.error as Error).message}</Alert>
            ) : displayMessages.length === 0 ? (
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
                <EmptyState
                  compact
                  icon={<ChatOutlinedIcon />}
                  title="Start a conversation"
                  description="Sessions begin in plan mode. Describe what you want; Claude will explore, ask clarifying questions, and present a plan. Use + to start a Review or Create draft PR session in parallel. Type / for commands, /clear to reset this session, or /rewind to restore the last prompt."
                  action={
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                      {CONTEXT_SLASH_CHIP_COMMANDS.map((command) => (
                        <Chip
                          key={command}
                          size="small"
                          label={command}
                          variant="outlined"
                          clickable
                          onClick={() => void runChatRef.current(command, [], [], false)}
                          sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                        />
                      ))}
                    </Stack>
                  }
                />
              </Box>
            ) : (
              displayMessages.map((message, index) => {
                if (message.role === 'assistant') {
                  const priorUser = [...displayMessages.slice(0, index)]
                    .reverse()
                    .find((item) => item.role === 'user');
                  return (
                    <MessageTimeline
                      key={message.id}
                      message={message}
                      onRetry={
                        message.metadata?.error && priorUser && priorUser.attachments.length === 0
                          ? () => void runChat(priorUser.content, [], [], true)
                          : undefined
                      }
                    />
                  );
                }
                return (
                  <ChatBubble
                    key={message.id}
                    message={message}
                    onCopy={() => void navigator.clipboard.writeText(message.content)}
                    onRewind={!archived ? () => requestRewind(message) : undefined}
                    onRetry={
                      message.metadata?.error && lastFailed
                        ? () => void runChat(lastFailed.text, lastFailed.images, lastFailed.mentions, true)
                        : undefined
                    }
                  />
                );
              })
            )}

            {permissionRequests.map((request) => {
              if (request.toolName === 'AskUserQuestion') {
                const questions = parseAskUserQuestions(request.input);
                return (
                  <AskUserQuestionCard
                    key={request.requestId}
                    request={request}
                    questions={questions}
                    submitting={permissionBusy}
                    onSubmit={(answers, response) =>
                      void submitAnswers(request, answers, response)
                    }
                    onDismiss={() => void skipAskUserQuestion(request)}
                  />
                );
              }
              if (request.toolName === 'ExitPlanMode') {
                return (
                  <ExitPlanModeCard
                    key={request.requestId}
                    request={request}
                    plan={extractPlanFromInput(request.input)}
                    submitting={permissionBusy}
                    onBuild={() => void buildPlan(request)}
                    onKeepPlanning={() => void keepPlanning(request)}
                  />
                );
              }
              return (
                <ToolPermissionCard
                  key={request.requestId}
                  request={request}
                  submitting={permissionBusy}
                  onAllow={() => void allowTool(request)}
                  onDeny={() => void denyTool(request)}
                />
              );
            })}
            <Box ref={bottomSentinelRef} sx={{ height: 1, width: '100%' }} aria-hidden />
          </Box>
        </Box>

        {showJumpToLatest ? (
          <Tooltip title="Jump to latest">
            <Fab
              size="small"
              color="primary"
              onClick={jumpToLatest}
              aria-label="Jump to latest messages"
              sx={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 2,
                color: '#0b0f17',
              }}
            >
              <KeyboardArrowDownIcon />
            </Fab>
          </Tooltip>
        ) : null}
      </Box>

      <Box
        sx={{
          flexShrink: 0,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'rgba(18,24,38,0.72)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Box
          sx={{
            maxWidth: CHAT_COLUMN_MAX_WIDTH,
            mx: 'auto',
            px: { xs: 1.25, sm: 2.5 },
            py: { xs: 1.25, sm: 1.5 },
            pb: {
              xs: `calc(10px + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
              sm: 1.5,
            },
          }}
        >
          {!archived && session ? (
            <InstructionDraftOfferBanner
              session={session}
              isStreaming={sessionBusy}
              onReview={() => setImproveOpen(true)}
            />
          ) : null}

          {!archived && activeSessionId ? (
            <CompactContinueBanner
              agentId={agentId}
              sessionId={activeSessionId}
              isStreaming={sessionBusy}
              stopped={stoppedSessionId === activeSessionId}
              compacting={compacting}
              onCompact={() => void compactAndContinue()}
            />
          ) : null}

          {chatError && (
            <Alert
              severity="error"
              sx={{ mb: 1 }}
              action={
                lastFailed ? (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() =>
                      void runChat(lastFailed.text, lastFailed.images, lastFailed.mentions, true)
                    }
                  >
                    Retry
                  </Button>
                ) : undefined
              }
              onClose={() => setChatError(null)}
            >
              {chatError}
            </Alert>
          )}

          {clearMutation.error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {(clearMutation.error as Error).message}
            </Alert>
          )}

          {rewindMutation.error && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => rewindMutation.reset()}>
              {(rewindMutation.error as Error).message}
            </Alert>
          )}

          {deleteSessionMutation.error && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => deleteSessionMutation.reset()}>
              {(deleteSessionMutation.error as Error).message}
            </Alert>
          )}

          <ChatComposer
            agentId={agentId}
            sessionId={activeSessionId}
            archived={archived}
            isStreaming={sessionBusy}
            model={session?.model ?? agent.model}
            effort={session?.effort ?? agent.effort}
            permissionMode={session?.permissionMode ?? agent.permissionMode ?? 'plan'}
            queue={queue}
            draft={draft}
            onDraftChange={setDraft}
            onModelChange={(model) => updateMutation.mutate({ model })}
            onEffortChange={(effort: EffortLevel) => updateMutation.mutate({ effort })}
            onPermissionModeChange={(permissionMode) => updateMutation.mutate({ permissionMode })}
            onSend={(text, images, mentions, force) => void runChat(text, images, mentions, force)}
            onStop={() => void stopStreaming()}
            onClear={requestClear}
            onRewind={requestRewindLast}
            grade={session?.grade}
            canGrade={displayMessages.length > 0 || Boolean(session?.grade)}
            onGrade={() => {
              gradeMutation.reset();
              setGradeOpen(true);
              if (!session?.grade?.analysis) {
                gradeMutation.mutate({});
              }
            }}
            onRemoveQueued={(id) => {
              const sid = activeSessionId;
              void api
                .removeQueuedMessage(agentId, sid, id)
                .catch(() => undefined)
                .finally(() => {
                  queryClient.invalidateQueries({ queryKey: ['queue', agentId, sid] });
                });
            }}
          />
        </Box>
      </Box>

      <ConfirmDialog
        open={clearOpen}
        title="Clear chat?"
        description="This clears this session's chat history, resets its Claude session, and returns it to plan mode. Other sessions are left as they are."
        confirmLabel="Clear"
        loading={clearMutation.isPending}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => clearMutation.mutate()}
      />

      <ConfirmDialog
        open={Boolean(rewindTarget)}
        title="Rewind chat?"
        description="This removes the selected message and everything after it, resets the Claude session, and puts that prompt back in the composer so you can edit and resend. Earlier messages stay visible; the next send starts a fresh Claude session."
        confirmLabel="Rewind"
        confirmColor="warning"
        loading={rewindMutation.isPending}
        onCancel={() => setRewindTarget(null)}
        onConfirm={() => {
          if (rewindTarget) rewindMutation.mutate(rewindTarget.id);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.title}?` : 'Delete session?'}
        description={
          deleteTarget && sessions.length <= 1
            ? `This deletes ${deleteTarget.title} and its messages. A new empty chat session will be created.${
                deleteTarget.status === 'running' ? ' The running reply will be stopped.' : ''
              }`
            : `This deletes this session and its messages. It cannot be undone.${
                deleteTarget?.status === 'running' ? ' The running reply will be stopped.' : ''
              } Other sessions are left as they are.`
        }
        confirmLabel="Delete"
        loading={deleteSessionMutation.isPending}
        onCancel={() => {
          if (deleteSessionMutation.isPending) return;
          setDeleteTarget(null);
          deleteSessionMutation.reset();
        }}
        onConfirm={() => {
          if (deleteTarget) deleteSessionMutation.mutate(deleteTarget);
        }}
      />

      <GradeSessionDialog
        open={gradeOpen}
        sessionTitle={session?.title ?? 'this session'}
        sessionFilePath={session?.grade?.analysis?.sessionFilePath ?? session?.runLogPath}
        current={session?.grade}
        loading={gradeMutation.isPending}
        error={gradeMutation.error ? (gradeMutation.error as Error).message : null}
        onClose={() => {
          setGradeOpen(false);
          gradeMutation.reset();
        }}
        onAnalyze={(notes) => gradeMutation.mutate({ notes: notes.trim() || undefined })}
        onImprove={() => {
          setGradeOpen(false);
          setImproveOpen(true);
        }}
      />

      {activeSessionId ? (
        <ImproveInstructionsDialog
          open={improveOpen}
          agentId={agentId}
          sessionId={activeSessionId}
          onClose={() => setImproveOpen(false)}
          onApplied={() => {
            queryClient.invalidateQueries({ queryKey: ['instruction-files', agentId] });
          }}
        />
      ) : null}
    </Box>
  );
}
