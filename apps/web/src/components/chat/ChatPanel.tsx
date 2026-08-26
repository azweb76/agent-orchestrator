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
  appendStreamText,
  applyStreamEvent,
  coalesceTimelineText,
  extractPlanFromInput,
  parseAskUserQuestions,
  type AgentDetail,
  type ChatSession,
  type ChatSessionTemplate,
  type Message,
  type PermissionMode,
  type PermissionRequest,
} from '@agent-orchestrator/shared';
import { api, streamBuildPlan, streamChat } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { ChatBubble } from './ChatBubble';
import { ChatComposer, type PendingImage, type QueuedChatItem } from './ChatComposer';
import { ChatSessionBar } from './ChatSessionBar';
import { ExitPlanModeCard } from './ExitPlanModeCard';
import { ToolPermissionCard } from './ToolPermissionCard';
import { ThinkingIndicator, ToolProgressBar } from './ToolActivity';

const CHAT_COLUMN_MAX_WIDTH = 780;

interface ChatPanelProps {
  agent: AgentDetail;
  archived: boolean;
  /** When set on a fresh agent (e.g. from-idea), send as the first chat prompt. */
  initialPrompt?: string;
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

function MessageTimeline({ message }: { message: Message }) {
  const parts = message.metadata?.timeline ?? [];
  const streaming = Boolean(message.metadata?.streaming);
  const toolItems = parts.filter(
    (part): part is Extract<(typeof parts)[number], { type: 'tool' }> =>
      part.type === 'tool',
  );
  const toolsRunning = toolItems.some((part) => part.status === 'running');
  const lastPart = parts[parts.length - 1];
  // Single progress card that updates with the active tool — never a tool list.
  const showToolProgress =
    streaming && (toolsRunning || lastPart?.type === 'tool');
  // One bubble per assistant turn — never split text across tool boundaries.
  const textContent = message.content.trim()
    ? message.content
    : coalesceTimelineText(parts);
  const showText = Boolean(textContent);
  const showThinking = streaming && !showText && !showToolProgress;

  return (
    <Box sx={{ mb: 2 }}>
      <ChatBubble
        gutter={false}
        hideBody={!showText && streaming}
        streaming={streaming}
        cursor={streaming && showText && !showToolProgress}
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
      />
      {showThinking ? <ThinkingIndicator /> : null}
      {showToolProgress ? <ToolProgressBar items={toolItems} /> : null}
    </Box>
  );
}

export function ChatPanel({ agent, archived, initialPrompt }: ChatPanelProps) {
  const agentId = agent.id;
  const queryClient = useQueryClient();
  const sessions = agent.sessions ?? [];
  const [sessionId, setSessionId] = useState(
    () => agent.activeSessionId ?? sessions[0]?.id ?? '',
  );
  const session: ChatSession | undefined =
    sessions.find((item) => item.id === sessionId) ?? sessions[0];
  const activeSessionId = session?.id ?? sessionId;
  const [draft, setDraft] = useState('');
  const [queues, setQueues] = useState<Record<string, QueuedChatItem[]>>({});
  const [sendingSessionIds, setSendingSessionIds] = useState<string[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<Message | null>(null);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [lastFailed, setLastFailed] = useState<{ text: string; images: PendingImage[] } | null>(
    null,
  );
  const abortBySessionRef = useRef(new Map<string, AbortController>());
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const sendingSessionsRef = useRef(new Set<string>());
  const queueRef = useRef<Record<string, QueuedChatItem[]>>({});
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);
  const sessionIdRef = useRef(activeSessionId);
  const [creatingSession, setCreatingSession] = useState(false);
  const runChatRef = useRef<
    (text: string, images: PendingImage[], force: boolean, sessionId?: string) => Promise<void>
  >(async () => undefined);

  sessionIdRef.current = activeSessionId;
  const queue = queues[activeSessionId] ?? [];
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

  const messagesQuery = useQuery({
    queryKey: ['messages', agentId, activeSessionId],
    queryFn: () => api.getMessages(agentId, activeSessionId),
    enabled: Boolean(activeSessionId),
    refetchInterval: () =>
      session?.status === 'running' || isSending ? 1000 : false,
  });

  const updateMutation = useMutation({
    mutationFn: (body: { model?: string; permissionMode?: PermissionMode }) =>
      api.updateSession(agentId, activeSessionId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', agentId] }),
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearMessages(agentId, activeSessionId),
    onSuccess: () => {
      setClearOpen(false);
      setQueues((prev) => ({ ...prev, [activeSessionId]: [] }));
      queueRef.current = { ...queueRef.current, [activeSessionId]: [] };
      setPermissionRequests([]);
      setChatError(null);
      queryClient.invalidateQueries({ queryKey: ['messages', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const rewindMutation = useMutation({
    mutationFn: (messageId: string) => api.rewindMessages(agentId, activeSessionId, messageId),
    onSuccess: (result) => {
      setRewindTarget(null);
      setQueues((prev) => ({ ...prev, [activeSessionId]: [] }));
      queueRef.current = { ...queueRef.current, [activeSessionId]: [] };
      setPermissionRequests([]);
      setChatError(null);
      setLastFailed(null);
      setDraft(result.draft);
      queryClient.invalidateQueries({ queryKey: ['messages', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
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
    queueRef.current = queues;
  }, [queues]);

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

  const enqueueForSession = (sid: string, item: QueuedChatItem) => {
    const next = [...(queueRef.current[sid] ?? []), item];
    queueRef.current = { ...queueRef.current, [sid]: next };
    setQueues((prev) => ({ ...prev, [sid]: next }));
  };

  const shiftQueue = (sid: string): QueuedChatItem | undefined => {
    const [next, ...rest] = queueRef.current[sid] ?? [];
    queueRef.current = { ...queueRef.current, [sid]: rest };
    setQueues((prev) => ({ ...prev, [sid]: rest }));
    return next;
  };

  const viewed = (sid: string) => sid === sessionIdRef.current;

  const runChat = async (
    text: string,
    images: PendingImage[],
    force: boolean,
    targetSessionId = sessionIdRef.current,
  ) => {
    if (archived || !mountedRef.current || !targetSessionId) return;

    const targetBusy =
      sendingSessionsRef.current.has(targetSessionId) ||
      (targetSessionId === activeSessionId && session?.status === 'running');

    if (targetBusy && !force) {
      enqueueForSession(targetSessionId, {
        id: `q-${Date.now()}-${Math.random()}`,
        text,
        images,
      });
      return;
    }

    if (targetBusy && force) {
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
        },
        {
          onSession: (nextSession) => {
            if (!mountedRef.current) return;
            const previousId = stream.sessionId;
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
            patchStreamingAssistant(stream.sessionId, (message) => ({
              ...message,
              metadata: {
                ...message.metadata,
                streaming: true,
                timeline: applyStreamEvent(message.metadata.timeline ?? [], event),
              },
            }));
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
              setLastFailed({ text, images });
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
          setLastFailed({ text, images });
        }
      }
      if (mountedRef.current) {
        queryClient.invalidateQueries({ queryKey: ['messages', agentId, stream.sessionId] });
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['messages', agentId, stream.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      releaseSessionAbort(stream.sessionId, controller);
      endSending(stream.sessionId);

      if (!mountedRef.current) return;

      const next = shiftQueue(stream.sessionId);
      if (next) {
        void runChat(next.text, next.images, false, stream.sessionId);
      }
    }
  };

  runChatRef.current = runChat;

  // From-idea: auto-send the idea as the first plan-mode prompt once messages load empty.
  useEffect(() => {
    if (!initialPrompt || archived || autoStartedRef.current) return;
    if (messagesQuery.isLoading) return;
    if ((messagesQuery.data?.length ?? 0) > 0) {
      autoStartedRef.current = true;
      return;
    }
    autoStartedRef.current = true;
    void runChatRef.current(initialPrompt, [], false);
  }, [initialPrompt, archived, messagesQuery.isLoading, messagesQuery.data]);

  const stopStreaming = async () => {
    const sid = sessionIdRef.current;
    abortBySessionRef.current.get(sid)?.abort();
    try {
      await api.stopSession(agentId, sid);
    } catch {
      // ignore
    }
    setPermissionRequests([]);
    queryClient.invalidateQueries({ queryKey: ['messages', agentId, sid] });
    queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sid] });
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

  const buildPlan = async (request: PermissionRequest) => {
    if (archived || !mountedRef.current) return;
    const planSessionId = sessionIdRef.current;
    setPermissionBusy(true);
    setChatError(null);

    abortBySessionRef.current.get(planSessionId)?.abort();
    await new Promise((r) => setTimeout(r, 150));
    if (!mountedRef.current) return;

    queueRef.current = { ...queueRef.current, [planSessionId]: [] };
    setQueues((prev) => ({ ...prev, [planSessionId]: [] }));
    setPermissionRequests([]);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);

    const stream = { sessionId: planSessionId };
    const controller = startSessionAbort(planSessionId);
    beginSending(planSessionId);

    const plan = extractPlanFromInput(request.input);

    try {
      await streamBuildPlan(
        agentId,
        planSessionId,
        { requestId: request.requestId, plan: plan || undefined },
        {
          onSession: (nextSession) => {
            if (!mountedRef.current) return;
            const previousId = stream.sessionId;
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
            patchStreamingAssistant(stream.sessionId, (message) => ({
              ...message,
              metadata: {
                ...message.metadata,
                streaming: true,
                timeline: applyStreamEvent(message.metadata.timeline ?? [], event),
              },
            }));
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
      releaseSessionAbort(stream.sessionId, controller);
      endSending(stream.sessionId);
      if (!mountedRef.current) return;
      setPermissionBusy(false);
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
    try {
      await api.activateSession(agentId, id);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    } catch (error) {
      setChatError((error as Error).message);
    }
  };

  const createSessionFromTemplate = async (template: ChatSessionTemplate) => {
    if (archived) return;
    setCreatingSession(true);
    setChatError(null);
    try {
      const result = await api.createSession(agentId, { template: template.id });
      sessionIdRef.current = result.session.id;
      setSessionId(result.session.id);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      if (result.kickoffPrompt) {
        void runChatRef.current(result.kickoffPrompt, [], false, result.session.id);
      }
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setCreatingSession(false);
    }
  };

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
                      {['/diff', '/test', '/pr', '/code-review'].map((command) => (
                        <Chip
                          key={command}
                          size="small"
                          label={command}
                          variant="outlined"
                          clickable
                          onClick={() => setDraft(command)}
                          sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                        />
                      ))}
                    </Stack>
                  }
                />
              </Box>
            ) : (
              displayMessages.map((message) => {
                if (message.role === 'assistant') {
                  return <MessageTimeline key={message.id} message={message} />;
                }
                return (
                  <ChatBubble
                    key={message.id}
                    message={message}
                    onCopy={() => void navigator.clipboard.writeText(message.content)}
                    onRewind={!archived ? () => requestRewind(message) : undefined}
                    onRetry={
                      message.metadata?.error && lastFailed
                        ? () => void runChat(lastFailed.text, lastFailed.images, true)
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
        <Box sx={{ maxWidth: CHAT_COLUMN_MAX_WIDTH, mx: 'auto', px: { xs: 1.25, sm: 2.5 }, py: { xs: 1.25, sm: 1.5 }, pb: { xs: 'calc(10px + env(safe-area-inset-bottom, 0px))', sm: 1.5 } }}>
          {chatError && (
            <Alert
              severity="error"
              sx={{ mb: 1 }}
              action={
                lastFailed ? (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => void runChat(lastFailed.text, lastFailed.images, true)}
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

          <ChatComposer
            agentId={agentId}
            archived={archived}
            isStreaming={sessionBusy}
            model={session?.model ?? agent.model}
            permissionMode={session?.permissionMode ?? agent.permissionMode ?? 'plan'}
            queue={queue}
            draft={draft}
            onDraftChange={setDraft}
            onModelChange={(model) => updateMutation.mutate({ model })}
            onPermissionModeChange={(permissionMode) => updateMutation.mutate({ permissionMode })}
            onSend={(text, images, force) => void runChat(text, images, force)}
            onStop={() => void stopStreaming()}
            onClear={requestClear}
            onRewind={requestRewindLast}
            onRemoveQueued={(id) => {
              const sid = activeSessionId;
              const next = (queueRef.current[sid] ?? []).filter((item) => item.id !== id);
              queueRef.current = { ...queueRef.current, [sid]: next };
              setQueues((prev) => ({ ...prev, [sid]: next }));
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
    </Box>
  );
}
