import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extractPlanFromInput,
  parseAskUserQuestions,
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
import {
  appendStreamText,
  applyStreamEvent,
  ToolChip,
  type StreamPart,
} from './ToolActivity';

interface ChatPanelProps {
  agent: AgentDetail;
  archived: boolean;
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

function StreamingTimeline({
  agentId,
  parts,
}: {
  agentId: string;
  parts: StreamPart[];
}) {
  if (parts.length === 0) return null;

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
            streaming
            message={{
              id: part.id,
              agentId,
              role: 'assistant',
              content: part.text,
              attachments: [],
              metadata: {},
              createdAt: new Date().toISOString(),
            }}
          />
        );
      })}
    </Box>
  );
}

export function ChatPanel({ agent, archived }: ChatPanelProps) {
  const agentId = agent.id;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [queue, setQueue] = useState<QueuedChatItem[]>([]);
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const [streamParts, setStreamParts] = useState<StreamPart[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [lastFailed, setLastFailed] = useState<{ text: string; images: PendingImage[] } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  const queueRef = useRef<QueuedChatItem[]>([]);

  const messagesQuery = useQuery({
    queryKey: ['messages', agentId],
    queryFn: () => api.getMessages(agentId),
    refetchInterval: () => (agent.status === 'running' || isStreaming ? 2000 : false),
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
      setOptimistic([]);
      setQueue([]);
      queueRef.current = [];
      setStreamParts([]);
      setPermissionRequests([]);
      setChatError(null);
      queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const pendingPermissionsQuery = useQuery({
    queryKey: ['permissions', agentId],
    queryFn: () => api.listPendingPermissions(agentId),
    enabled: Boolean(agentId) && (agent.status === 'running' || isStreaming),
    refetchInterval: () => (agent.status === 'running' || isStreaming ? 2000 : false),
  });

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const remote = pendingPermissionsQuery.data;
    if (!remote) return;
    setPermissionRequests(remote);
  }, [pendingPermissionsQuery.data]);

  useEffect(() => {
    const msgs = messagesQuery.data;
    if (!msgs) return;
    setOptimistic((prev) =>
      prev.filter((m) => {
        if (msgs.some((s) => s.id === m.id)) return false;
        if (m.id.startsWith('local-')) {
          return !msgs.some(
            (s) => s.role === 'user' && s.content === m.content && s.createdAt >= m.createdAt,
          );
        }
        return true;
      }),
    );
  }, [messagesQuery.data]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data, optimistic, streamParts, permissionRequests]);

  const serverMessages = messagesQuery.data ?? [];
  const displayMessages = [
    ...serverMessages,
    ...optimistic.filter((m) => !serverMessages.some((s) => s.id === m.id)),
  ];

  const runChat = async (text: string, images: PendingImage[], force: boolean) => {
    if (archived) return;

    if (streamingRef.current && !force) {
      const item: QueuedChatItem = {
        id: `q-${Date.now()}-${Math.random()}`,
        text,
        images,
      };
      setQueue((prev) => [...prev, item]);
      return;
    }

    if (streamingRef.current && force) {
      abortRef.current?.abort();
      try {
        await api.stopAgent(agentId);
      } catch {
        // best-effort interrupt
      }
      // allow previous stream finally to settle
      await new Promise((r) => setTimeout(r, 200));
    }

    setChatError(null);
    setLastFailed(null);
    setStreamParts([]);
    setPermissionRequests([]);
    setIsStreaming(true);
    streamingRef.current = true;

    const localUser = makeLocalUserMessage(agentId, text, images);
    setOptimistic((prev) => [...prev, localUser]);

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
            setOptimistic((prev) => [
              ...prev.filter((m) => m.id !== localUser.id),
              message,
            ]);
          },
          onToken: (token) => setStreamParts((prev) => appendStreamText(prev, token)),
          onEvent: (event) => {
            setStreamParts((prev) => applyStreamEvent(prev, event));
          },
          onPermissionRequest: (request) => {
            setPermissionRequests((prev) => {
              if (prev.some((item) => item.requestId === request.requestId)) return prev;
              return [...prev, request];
            });
          },
          onDone: (payload) => {
            setStreamParts((prev) =>
              prev.map((part) =>
                part.type === 'tool' && part.status === 'running'
                  ? { ...part, status: 'done' as const }
                  : part,
              ),
            );
            setOptimistic((prev) => [
              ...prev.filter((m) => m.id !== localUser.id && m.id !== payload.message.id),
              payload.message,
            ]);
            setStreamParts([]);
            setPermissionRequests([]);
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
            queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
          },
          onError: (err) => {
            setChatError(err);
            setLastFailed({ text, images });
            setStreamParts([]);
          },
        },
        abortRef.current.signal,
      );
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setChatError((error as Error).message);
        setLastFailed({ text, images });
      }
      setStreamParts([]);
    } finally {
      setIsStreaming(false);
      streamingRef.current = false;
      abortRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });

      const next = queueRef.current[0];
      if (next) {
        setQueue((prev) => prev.slice(1));
        void runChat(next.text, next.images, false);
      }
    }
  };

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

  const buildPlan = async (request: PermissionRequest) => {
    if (archived) return;
    setPermissionBusy(true);
    setChatError(null);

    // Abort the plan-mode SSE; Build starts a fresh auto-mode stream.
    abortRef.current?.abort();
    await new Promise((r) => setTimeout(r, 150));

    setOptimistic([]);
    setQueue([]);
    queueRef.current = [];
    setStreamParts([]);
    setPermissionRequests([]);
    setIsStreaming(true);
    streamingRef.current = true;
    abortRef.current = new AbortController();

    const plan = extractPlanFromInput(request.input);

    try {
      await streamBuildPlan(
        agentId,
        { requestId: request.requestId, plan: plan || undefined },
        {
          onUserMessage: (message) => {
            setOptimistic((prev) => [...prev.filter((m) => m.id !== message.id), message]);
          },
          onToken: (token) => setStreamParts((prev) => appendStreamText(prev, token)),
          onEvent: (event) => {
            setStreamParts((prev) => applyStreamEvent(prev, event));
          },
          onPermissionRequest: (nextRequest) => {
            setPermissionRequests((prev) => {
              if (prev.some((item) => item.requestId === nextRequest.requestId)) return prev;
              return [...prev, nextRequest];
            });
          },
          onDone: (payload) => {
            setOptimistic((prev) => [
              ...prev.filter((m) => m.id !== payload.message.id),
              payload.message,
            ]);
            setStreamParts([]);
            setPermissionRequests([]);
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
            queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
            queryClient.invalidateQueries({ queryKey: ['sidebar'] });
          },
          onError: (err) => {
            setChatError(err);
            setStreamParts([]);
          },
        },
        abortRef.current.signal,
      );
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setChatError((error as Error).message);
      }
      setStreamParts([]);
    } finally {
      setIsStreaming(false);
      streamingRef.current = false;
      abortRef.current = null;
      setPermissionBusy(false);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
    }
  };

  const requestClear = () => setClearOpen(true);

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
        {displayMessages.length === 0 && streamParts.length === 0 && (
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
              to reset.
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

        {displayMessages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            onCopy={() => void navigator.clipboard.writeText(message.content)}
            onEditResend={
              message.role === 'user'
                ? () => {
                    setDraft(message.content);
                  }
                : undefined
            }
            onRetry={
              message.metadata?.error && lastFailed
                ? () => void runChat(lastFailed.text, lastFailed.images, true)
                : undefined
            }
          />
        ))}

        {(isStreaming || streamParts.length > 0) && (
          <StreamingTimeline agentId={agentId} parts={streamParts} />
        )}

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
          return null;
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

        <ChatComposer
          agentId={agentId}
          archived={archived}
          isStreaming={isStreaming || agent.status === 'running'}
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
    </Box>
  );
}
