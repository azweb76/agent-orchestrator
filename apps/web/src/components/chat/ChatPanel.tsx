import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  appendStreamText,
  applyStreamEvent,
  extractPlanFromInput,
  parseAskUserQuestions,
  buildIdeaKickoffPrompt,
  type AgentDetail,
  type Message,
  type PermissionMode,
  type PermissionRequest,
} from '@agent-orchestrator/shared';
import { api, streamBuildPlan, streamChat } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { ChatBubble } from './ChatBubble';
import { ChatComposer, type PendingImage, type QueuedChatItem } from './ChatComposer';
import { ExitPlanModeCard } from './ExitPlanModeCard';
import { ToolPermissionCard } from './ToolPermissionCard';
import { ToolChip } from './ToolActivity';

interface ChatPanelProps {
  agent: AgentDetail;
  archived: boolean;
  /** When set on a fresh agent (e.g. from-idea), send as the first plan-mode prompt. */
  initialPrompt?: string;
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

  if (parts.length === 0) {
    return (
      <ChatBubble
        message={message}
        streaming={streaming}
        onCopy={() => void navigator.clipboard.writeText(message.content)}
      />
    );
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      {parts.map((part) => {
        if (part.type === 'tool') {
          return (
            <Box key={part.id} sx={{ mb: 1 }}>
              <ToolChip item={part} />
            </Box>
          );
        }
        if (!part.text) return null;
        return (
          <ChatBubble
            key={part.id}
            streaming={streaming}
            message={{
              id: `${message.id}-${part.id}`,
              agentId: message.agentId,
              role: 'assistant',
              content: part.text,
              attachments: [],
              metadata: {
                costUsd: message.metadata?.costUsd,
                durationMs: message.metadata?.durationMs,
                stopped: message.metadata?.stopped,
                error: message.metadata?.error,
              },
              createdAt: message.createdAt,
            }}
            onCopy={() => void navigator.clipboard.writeText(part.text)}
          />
        );
      })}
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
  const chatEndRef = useRef<HTMLDivElement>(null);
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
    enabled: Boolean(agentId) && agentBusy,
    refetchInterval: () => (agentBusy ? 2000 : false),
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
    if (!remote) return;
    setPermissionRequests(remote);
  }, [pendingPermissionsQuery.data]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data, permissionRequests]);

  const displayMessages = messagesQuery.data ?? [];

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
            setPermissionRequests([]);
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
            queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
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
    void runChatRef.current(buildIdeaKickoffPrompt(initialPrompt), [], false);
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
            setPermissionRequests([]);
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
            queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
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
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, pt: 1.5, pb: 1, minHeight: 0 }}>
        {displayMessages.length === 0 && (
          <Stack spacing={1} sx={{ py: 3, alignItems: 'center', textAlign: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Start a conversation
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
              Sessions start in plan mode. Describe what you want; Claude will explore, ask
              clarifying questions, and present a plan to build. Type{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                /
              </Box>{' '}
              for slash commands, or{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                /clear
              </Box>{' '}
              to reset, or{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                /rewind
              </Box>{' '}
              to restore the last prompt.
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button size="small" variant="outlined" onClick={() => setDraft('/diff')}>
                /diff
              </Button>
              <Button size="small" variant="outlined" onClick={() => setDraft('/test')}>
                /test
              </Button>
              <Button size="small" variant="outlined" onClick={() => setDraft('/pr')}>
                /pr
              </Button>
              <Button size="small" variant="outlined" onClick={() => setDraft('/code-review')}>
                /code-review
              </Button>
            </Stack>
          </Stack>
        )}

        {displayMessages.map((message) => {
          if (message.role === 'assistant') {
            return (
              <MessageTimeline key={message.id} message={message} />
            );
          }
          return (
            <ChatBubble
              key={message.id}
              message={message}
              onCopy={() => void navigator.clipboard.writeText(message.content)}
              onRewind={
                !archived
                  ? () => requestRewind(message)
                  : undefined
              }
              onRetry={
                message.metadata?.error && lastFailed
                  ? () => void runChat(lastFailed.text, lastFailed.images, true)
                  : undefined
              }
            />
          );
        })}

        {permissionRequests.map((request) => {
          if (request.toolName === 'AskUserQuestion') {
            const questions = parseAskUserQuestions(request.input);
            if (questions.length === 0) return null;
            return (
              <AskUserQuestionCard
                key={request.requestId}
                request={request}
                questions={questions}
                submitting={permissionBusy}
                onSubmit={(answers, response) =>
                  void submitAnswers(request, answers, response)
                }
                onDismiss={() => void keepPlanning(request)}
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

        <div ref={chatEndRef} />
      </Box>

      <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1.5, py: 1.25, flexShrink: 0 }}>
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
