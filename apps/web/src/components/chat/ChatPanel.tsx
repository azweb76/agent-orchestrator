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
import { api } from '../../api/client';
import {
  attachAgentLiveIfNeeded,
  buildApprovedPlanChat,
  reconcileOptimisticWithServer,
  removePermissionRequest,
  removeQueuedItem,
  resetChatSessionUi,
  runAgentChat,
  setChatError,
  setPermissionBusy,
  setPermissionRequests,
  stopAgentChat,
  useAgentChatSession,
} from '../../chat/agentChatSession';
import { ConfirmDialog } from '../ConfirmDialog';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { ChatBubble } from './ChatBubble';
import { ChatComposer, type PendingImage } from './ChatComposer';
import { ExitPlanModeCard } from './ExitPlanModeCard';
import { ToolPermissionCard } from './ToolPermissionCard';
import { ToolChip, type StreamPart } from './ToolActivity';

interface ChatPanelProps {
  agent: AgentDetail;
  archived: boolean;
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
  const [clearOpen, setClearOpen] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<Message | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    optimistic,
    streamParts,
    isStreaming,
    queue,
    permissionRequests,
    chatError,
    lastFailed,
    permissionBusy,
  } = useAgentChatSession(agentId);

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
      resetChatSessionUi(agentId);
      queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const rewindMutation = useMutation({
    mutationFn: (messageId: string) => api.rewindMessages(agentId, messageId),
    onSuccess: (result) => {
      setRewindTarget(null);
      resetChatSessionUi(agentId);
      setDraft(result.draft);
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
    const remote = pendingPermissionsQuery.data;
    if (!remote) return;
    setPermissionRequests(agentId, remote);
  }, [agentId, pendingPermissionsQuery.data]);

  useEffect(() => {
    const msgs = messagesQuery.data;
    if (!msgs) return;
    reconcileOptimisticWithServer(agentId, msgs);
  }, [agentId, messagesQuery.data]);

  useEffect(() => {
    attachAgentLiveIfNeeded(agentId, queryClient, agent.status === 'running');
  }, [agentId, agent.status, queryClient]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data, optimistic, streamParts, permissionRequests]);

  const serverMessages = messagesQuery.data ?? [];
  const displayMessages = [
    ...serverMessages,
    ...optimistic.filter(
      (m) => m.agentId === agentId && !serverMessages.some((s) => s.id === m.id),
    ),
  ];

  const runChat = (text: string, images: PendingImage[], force: boolean) =>
    runAgentChat(agentId, queryClient, text, images, force, { archived });

  const submitAnswers = async (
    request: PermissionRequest,
    answers: Record<string, string>,
    response?: string,
  ) => {
    setPermissionBusy(agentId, true);
    setChatError(agentId, null);
    try {
      await api.answerPermission(agentId, {
        requestId: request.requestId,
        answers,
        response,
      });
      removePermissionRequest(agentId, request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
    } catch (error) {
      setChatError(agentId, (error as Error).message);
    } finally {
      setPermissionBusy(agentId, false);
    }
  };

  const keepPlanning = async (request: PermissionRequest) => {
    setPermissionBusy(agentId, true);
    setChatError(agentId, null);
    try {
      await api.denyPermission(agentId, {
        requestId: request.requestId,
        message: 'User wants to keep planning. Revise the plan based on further feedback.',
      });
      removePermissionRequest(agentId, request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
    } catch (error) {
      setChatError(agentId, (error as Error).message);
    } finally {
      setPermissionBusy(agentId, false);
    }
  };

  const allowTool = async (request: PermissionRequest) => {
    setPermissionBusy(agentId, true);
    setChatError(agentId, null);
    try {
      await api.allowPermission(agentId, { requestId: request.requestId });
      removePermissionRequest(agentId, request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
    } catch (error) {
      setChatError(agentId, (error as Error).message);
    } finally {
      setPermissionBusy(agentId, false);
    }
  };

  const denyTool = async (request: PermissionRequest) => {
    setPermissionBusy(agentId, true);
    setChatError(agentId, null);
    try {
      await api.denyPermission(agentId, {
        requestId: request.requestId,
        message: 'User denied this tool request.',
      });
      removePermissionRequest(agentId, request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId] });
    } catch (error) {
      setChatError(agentId, (error as Error).message);
    } finally {
      setPermissionBusy(agentId, false);
    }
  };

  const buildPlan = (request: PermissionRequest) =>
    void buildApprovedPlanChat(agentId, queryClient, request, { archived });

  const requestClear = () => setClearOpen(true);

  const requestRewind = (message: Message) => {
    if (archived || isStreaming || agent.status === 'running') return;
    if (message.id.startsWith('local-')) return;
    setRewindTarget(message);
  };

  const requestRewindLast = () => {
    const lastUser = [...displayMessages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      setChatError(agentId, 'Nothing to rewind — send a message first.');
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

        {displayMessages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            onCopy={() => void navigator.clipboard.writeText(message.content)}
            onRewind={
              message.role === 'user' && !archived && !message.id.startsWith('local-')
                ? () => requestRewind(message)
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
                onBuild={() => buildPlan(request)}
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
            onClose={() => setChatError(agentId, null)}
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
          isStreaming={isStreaming || agent.status === 'running'}
          model={agent.model}
          permissionMode={agent.permissionMode ?? 'plan'}
          queue={queue}
          draft={draft}
          onDraftChange={setDraft}
          onModelChange={(model) => updateMutation.mutate({ model })}
          onPermissionModeChange={(permissionMode) => updateMutation.mutate({ permissionMode })}
          onSend={(text, images, force) => void runChat(text, images, force)}
          onStop={() => void stopAgentChat(agentId, queryClient)}
          onClear={requestClear}
          onRewind={requestRewindLast}
          onRemoveQueued={(id) => removeQueuedItem(agentId, id)}
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
