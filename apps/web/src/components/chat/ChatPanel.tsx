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
import { extractToolActivity, ToolActivity, type ToolActivityItem } from './ToolActivity';

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

export function ChatPanel({ agent, archived }: ChatPanelProps) {
  const agentId = agent.id;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [queue, setQueue] = useState<QueuedChatItem[]>([]);
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [toolActivity, setToolActivity] = useState<ToolActivityItem[]>([]);
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
      setStreamingText('');
      setToolActivity([]);
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
  }, [messagesQuery.data, optimistic, streamingText, toolActivity]);

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
    setStreamingText('');
    setToolActivity([]);
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
          onToken: (token) => setStreamingText((prev) => prev + token),
          onEvent: (event) => {
            setToolActivity((prev) => extractToolActivity(event, prev));
          },
          onDone: (payload) => {
            setStreamingText('');
            setToolActivity((prev) =>
              prev.map((item) => ({ ...item, status: 'done' as const })),
            );
            setOptimistic((prev) => [
              ...prev.filter((m) => m.id !== localUser.id && m.id !== payload.message.id),
              payload.message,
            ]);
            queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            queryClient.invalidateQueries({ queryKey: ['events', agentId] });
            queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
          },
          onError: (err) => {
            setChatError(err);
            setLastFailed({ text, images });
            setStreamingText('');
          },
        },
        abortRef.current.signal,
      );
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setChatError((error as Error).message);
        setLastFailed({ text, images });
      }
      setStreamingText('');
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
        {displayMessages.length === 0 && !streamingText && (
          <Stack spacing={1.5} sx={{ py: 6, alignItems: 'center', textAlign: 'center' }}>
            <Typography variant="h6">Start a conversation</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
              Ask the agent to explore the worktree, fix a bug, or draft a PR. Try{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                /diff
              </Box>
              ,{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                /test
              </Box>
              , or{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                /pr
              </Box>
              .
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={() => setDraft('/diff')}>
                /diff
              </Button>
              <Button size="small" variant="outlined" onClick={() => setDraft('/test')}>
                /test
              </Button>
              <Button size="small" variant="outlined" onClick={() => setDraft('/pr')}>
                /pr
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

        {(isStreaming || toolActivity.length > 0) && (
          <Box sx={{ mb: 1.5 }}>
            <ToolActivity items={toolActivity} />
            {streamingText && (
              <ChatBubble
                streaming
                message={{
                  id: 'streaming',
                  agentId,
                  role: 'assistant',
                  content: streamingText,
                  attachments: [],
                  metadata: {},
                  createdAt: new Date().toISOString(),
                }}
              />
            )}
          </Box>
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
          onClear={() => {
            if (confirm('Clear chat history and reset the Claude session?')) {
              clearMutation.mutate();
            }
          }}
          onRemoveQueued={(id) => setQueue((prev) => prev.filter((item) => item.id !== id))}
        />
      </Box>
    </Box>
  );
}
