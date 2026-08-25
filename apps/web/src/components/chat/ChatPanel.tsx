import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentDetail, Message, PermissionMode } from '@agent-orchestrator/shared';
import { api, streamChat } from '../../api/client';
import { ChatBubble } from './ChatBubble';
import { ChatComposer, type PendingImage, type QueuedChatItem } from './ChatComposer';
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
      setOptimistic([]);
      setQueue([]);
      queueRef.current = [];
      setStreamParts([]);
      setChatError(null);
      queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

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
  }, [messagesQuery.data, optimistic, streamParts]);

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
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
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
    queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
    queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
  };

  const requestClear = () => {
    if (confirm('Clear chat history and reset the Claude session?')) {
      clearMutation.mutate();
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: { xs: 520, md: 'calc(100vh - 280px)' },
        maxHeight: { xs: 'none', md: 'calc(100vh - 200px)' },
      }}
    >
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 2, pb: 1 }}>
        {displayMessages.length === 0 && streamParts.length === 0 && (
          <Stack spacing={1.5} sx={{ py: 6, alignItems: 'center', textAlign: 'center' }}>
            <Typography variant="h6">Start a conversation</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
              Ask the agent to explore the worktree, fix a bug, or draft a PR. Type{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                /
              </Box>{' '}
              for slash commands and skills, or try{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                /clear
              </Box>{' '}
              to reset the session.
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
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

        <div ref={chatEndRef} />
      </Box>

      <Box sx={{ borderTop: 1, borderColor: 'divider', p: 2 }}>
        {chatError && (
          <Alert
            severity="error"
            sx={{ mb: 1.5 }}
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
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {(clearMutation.error as Error).message}
          </Alert>
        )}

        <ChatComposer
          agentId={agentId}
          archived={archived}
          isStreaming={isStreaming || agent.status === 'running'}
          model={agent.model}
          permissionMode={agent.permissionMode ?? 'bypassPermissions'}
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
    </Box>
  );
}
