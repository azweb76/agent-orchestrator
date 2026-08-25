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
import { ExitPlanModeCard } from './ExitPlanModeCard';
import { ToolPermissionCard } from './ToolPermissionCard';
import { ThinkingIndicator, ToolProgressBar } from './ToolActivity';

const CHAT_COLUMN_MAX_WIDTH = 780;

interface ChatPanelProps {
  agent: AgentDetail;
  archived: boolean;
  /** When set on a fresh agent (e.g. from-idea), send as the first plan-mode prompt. */
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
  updater: (prev: Message[] | undefined) => Message[],
): void {
  queryClient.setQueryData<Message[]>(['messages', agentId], (prev) => updater(prev));
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
  const [draft, setDraft] = useState('');
  const [queue, setQueue] = useState<QueuedChatItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<Message | null>(null);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [lastFailed, setLastFailed] = useState<{ text: string; images: PendingImage[] } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const sendingRef = useRef(false);
  const queueRef = useRef<QueuedChatItem[]>([]);
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);
  const runChatRef = useRef<(text: string, images: PendingImage[], force: boolean) => Promise<void>>(
    async () => undefined,
  );

  const messagesQuery = useQuery({
    queryKey: ['messages', agentId],
    queryFn: () => api.getMessages(agentId),
    // Backend is the source of truth — poll while a run is in progress.
    refetchInterval: () => (agent.status === 'running' || isSending ? 1000 : false),
  });

  const updateMutation = useMutation({
    mutationFn: (body: { model?: string; permissionMode?: PermissionMode }) =>
      api.updateAgent(agentId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', agentId] }),
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearMessages(agentId),
    onSuccess: () => {
      setClearOpen(false);
      setQueue([]);
      queueRef.current = [];
      setPermissionRequests([]);
      setChatError(null);
      queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const rewindMutation = useMutation({
    mutationFn: (messageId: string) => api.rewindMessages(agentId, messageId),
    onSuccess: (result) => {
      setRewindTarget(null);
      setQueue([]);
      queueRef.current = [];
      setPermissionRequests([]);
      setChatError(null);
      setLastFailed(null);
      setDraft(result.draft);
      queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const hasStreamingMessage = (messagesQuery.data ?? []).some((m) => m.metadata?.streaming);
  const agentBusy = agent.status === 'running' || isSending || hasStreamingMessage;

  const pendingPermissionsQuery = useQuery({
    queryKey: ['permissions', agentId],
    queryFn: () => api.listPendingPermissions(agentId),
    enabled: Boolean(agentId) && (agentBusy || permissionRequests.length > 0),
    refetchInterval: () => (agentBusy || permissionRequests.length > 0 ? 2000 : false),
  });

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Aborting only drops the UI SSE subscription — the backend keeps the run
      // and continues persisting chat history.
      abortRef.current?.abort();
      sendingRef.current = false;
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
  }, [agentId]);

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
  }, [agentId, displayMessages.length, permissionRequests.length, messagesQuery.isLoading]);

  const patchStreamingAssistant = (
    mutate: (message: Message) => Message,
  ) => {
    setMessagesCache(queryClient, agentId, (prev) => {
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

  const runChat = async (text: string, images: PendingImage[], force: boolean) => {
    if (archived || !mountedRef.current) return;

    if (sendingRef.current && !force) {
      const item: QueuedChatItem = {
        id: `q-${Date.now()}-${Math.random()}`,
        text,
        images,
      };
      setQueue((prev) => [...prev, item]);
      return;
    }

    if ((sendingRef.current || agent.status === 'running') && force) {
      abortRef.current?.abort();
      try {
        await api.stopAgent(agentId);
      } catch {
        // best-effort interrupt
      }
      await new Promise((r) => setTimeout(r, 200));
      if (!mountedRef.current) return;
    }

    setChatError(null);
    setLastFailed(null);
    setPermissionRequests([]);
    setIsSending(true);
    sendingRef.current = true;
    // Sending should always pin the viewport to the latest messages.
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    abortRef.current = new AbortController();

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
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, (prev) => upsertMessage(prev, message));
          },
          onAssistantMessage: (message) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, (prev) => upsertMessage(prev, message));
          },
          onToken: (token) => {
            if (!mountedRef.current) return;
            patchStreamingAssistant((message) => ({
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
            patchStreamingAssistant((message) => ({
              ...message,
              metadata: {
                ...message.metadata,
                streaming: true,
                timeline: applyStreamEvent(message.metadata.timeline ?? [], event),
              },
            }));
          },
          onPermissionRequest: (request) => {
            if (!mountedRef.current) return;
            setPermissionRequests((prev) => {
              if (prev.some((item) => item.requestId === request.requestId)) return prev;
              return [...prev, request];
            });
          },
          onDone: (payload) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, (prev) => upsertMessage(prev, payload.message));
            // Refresh from server instead of blindly clearing — avoids racing a
            // late permission_request that arrives near turn end.
            void queryClient
              .invalidateQueries({ queryKey: ['permissions', agentId] })
              .then(() => api.listPendingPermissions(agentId))
              .then((pending) => {
                if (mountedRef.current) setPermissionRequests(pending);
              })
              .catch(() => {
                if (mountedRef.current) setPermissionRequests([]);
              });
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
          },
          onError: (err) => {
            if (!mountedRef.current) return;
            setChatError(err);
            setLastFailed({ text, images });
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
          },
        },
        abortRef.current.signal,
      );
    } catch (error) {
      if (mountedRef.current && (error as Error).name !== 'AbortError') {
        setChatError((error as Error).message);
        setLastFailed({ text, images });
      }
      if (mountedRef.current) {
        queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      }
    } finally {
      // Always refresh from the backend after the UI subscription ends so a
      // remount / toggle-back sees persisted history.
      void queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });

      if (!mountedRef.current) {
        sendingRef.current = false;
        abortRef.current = null;
        return;
      }
      setIsSending(false);
      sendingRef.current = false;
      abortRef.current = null;

      const next = queueRef.current[0];
      if (next) {
        setQueue((prev) => prev.slice(1));
        void runChat(next.text, next.images, false);
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
    abortRef.current?.abort();
    try {
      await api.stopAgent(agentId);
    } catch {
      // ignore
    }
    setPermissionRequests([]);
    queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
    queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
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
      await api.answerPermission(agentId, {
        requestId: request.requestId,
        answers,
        response,
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const keepPlanning = async (request: PermissionRequest) => {
    setPermissionBusy(true);
    setChatError(null);
    try {
      await api.denyPermission(agentId, {
        requestId: request.requestId,
        message: 'User wants to keep planning. Revise the plan based on further feedback.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
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
      await api.answerPermission(agentId, {
        requestId: request.requestId,
        answers: {},
        response:
          'User skipped these questions. Continue with sensible defaults and ask again only if blocked.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
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
      await api.allowPermission(agentId, { requestId: request.requestId });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
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
      await api.denyPermission(agentId, {
        requestId: request.requestId,
        message: 'User denied this tool request.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const buildPlan = async (request: PermissionRequest) => {
    if (archived || !mountedRef.current) return;
    setPermissionBusy(true);
    setChatError(null);

    abortRef.current?.abort();
    await new Promise((r) => setTimeout(r, 150));
    if (!mountedRef.current) return;

    setQueue([]);
    queueRef.current = [];
    setPermissionRequests([]);
    setIsSending(true);
    sendingRef.current = true;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    abortRef.current = new AbortController();

    const plan = extractPlanFromInput(request.input);

    try {
      await streamBuildPlan(
        agentId,
        { requestId: request.requestId, plan: plan || undefined },
        {
          onUserMessage: (message) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, (prev) => upsertMessage(prev, message));
          },
          onAssistantMessage: (message) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, (prev) => upsertMessage(prev, message));
          },
          onToken: (token) => {
            if (!mountedRef.current) return;
            patchStreamingAssistant((message) => ({
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
            patchStreamingAssistant((message) => ({
              ...message,
              metadata: {
                ...message.metadata,
                streaming: true,
                timeline: applyStreamEvent(message.metadata.timeline ?? [], event),
              },
            }));
          },
          onPermissionRequest: (nextRequest) => {
            if (!mountedRef.current) return;
            setPermissionRequests((prev) => {
              if (prev.some((item) => item.requestId === nextRequest.requestId)) return prev;
              return [...prev, nextRequest];
            });
          },
          onDone: (payload) => {
            if (!mountedRef.current) return;
            setMessagesCache(queryClient, agentId, (prev) => upsertMessage(prev, payload.message));
            void queryClient
              .invalidateQueries({ queryKey: ['permissions', agentId] })
              .then(() => api.listPendingPermissions(agentId))
              .then((pending) => {
                if (mountedRef.current) setPermissionRequests(pending);
              })
              .catch(() => {
                if (mountedRef.current) setPermissionRequests([]);
              });
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
            queryClient.invalidateQueries({ queryKey: ['sidebar'] });
          },
          onError: (err) => {
            if (!mountedRef.current) return;
            setChatError(err);
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
          },
        },
        abortRef.current.signal,
      );
    } catch (error) {
      if (mountedRef.current && (error as Error).name !== 'AbortError') {
        setChatError((error as Error).message);
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      if (!mountedRef.current) {
        sendingRef.current = false;
        abortRef.current = null;
        return;
      }
      setIsSending(false);
      sendingRef.current = false;
      abortRef.current = null;
      setPermissionBusy(false);
    }
  };

  const requestClear = () => setClearOpen(true);

  const requestRewind = (message: Message) => {
    if (archived || agentBusy) return;
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
                  description="Sessions begin in plan mode. Describe what you want; Claude will explore, ask clarifying questions, and present a plan. Type / for commands, /clear to reset, or /rewind to restore the last prompt."
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
        <Box sx={{ maxWidth: CHAT_COLUMN_MAX_WIDTH, mx: 'auto', px: { xs: 1.5, sm: 2.5 }, py: 1.5 }}>
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
            isStreaming={agentBusy}
            model={agent.model}
            permissionMode={agent.permissionMode ?? 'plan'}
            queue={queue}
            draft={draft}
            onDraftChange={setDraft}
            onModelChange={(model) => updateMutation.mutate({ model })}
            onPermissionModeChange={(permissionMode) => updateMutation.mutate({ permissionMode })}
            onSend={(text, images, force) => void runChat(text, images, force)}
            onStop={() => void stopStreaming()}
            onClear={requestClear}
            onRewind={requestRewindLast}
            onRemoveQueued={(id) => setQueue((prev) => prev.filter((item) => item.id !== id))}
          />
        </Box>
      </Box>

      <ConfirmDialog
        open={clearOpen}
        title="Clear chat?"
        description="This clears chat history, resets the Claude session, and returns the agent to plan mode."
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
