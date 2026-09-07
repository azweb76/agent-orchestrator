import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import SendIcon from '@mui/icons-material/Send';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssistantMessage } from '@agent-orchestrator/shared';
import { api, streamAssistantChat } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { AssistantStarterChips } from './AssistantStarterChips';
import { AssistantBubble } from './AssistantChatBubbles';
import { applyAssistantStreamEvent } from './assistantStreamReducer';

export function AssistantChatPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamingIds, setStreamingIds] = useState<Set<string>>(() => new Set());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['assistant', 'messages'],
    queryFn: () => api.getAssistantMessages(),
  });

  const clear = useMutation({
    mutationFn: () => api.clearAssistantMessages(),
    onSuccess: () => {
      queryClient.setQueryData(['assistant', 'messages'], { messages: [] });
    },
  });

  const messages = messagesQuery.data?.messages ?? [];
  const lastContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, streaming, lastContent]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || streaming) return;

    setDraft('');
    setStreamError(null);
    setStreaming(true);
    setStreamingIds(new Set());

    const optimistic: AssistantMessage = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const previous = messagesQuery.data?.messages ?? [];
    queryClient.setQueryData(['assistant', 'messages'], {
      messages: [...previous, optimistic],
    });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await streamAssistantChat(
        trimmed,
        (event) => {
          if (event.type === 'assistant_start') {
            setStreamingIds((prev) => new Set(prev).add(event.messageId));
          }
          if (event.type === 'assistant_message') {
            setStreamingIds((prev) => {
              const next = new Set(prev);
              next.delete(event.message.id);
              return next;
            });
          }
          queryClient.setQueryData(
            ['assistant', 'messages'],
            (old: { messages: AssistantMessage[] } | undefined) => ({
              messages: applyAssistantStreamEvent(old?.messages ?? [], event),
            }),
          );
          if (event.type === 'done') {
            const nav = [...event.messages]
              .reverse()
              .find((msg) => msg.toolResult?.navigateTo)?.toolResult?.navigateTo;
            if (nav) navigate(nav);
          }
        },
        abort.signal,
      );
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'work-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    } catch (error) {
      if (abort.signal.aborted) return;
      setStreamError(error instanceof Error ? error.message : String(error));
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
    } finally {
      setStreaming(false);
      setStreamingIds(new Set());
      abortRef.current = null;
    }
  };

  const busy = streaming || clear.isPending;

  return (
    <Stack spacing={1.25} sx={{ mt: 0.5, width: '100%', maxWidth: 880 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <AutoAwesomeOutlinedIcon sx={{ color: 'secondary.main', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Fleet Assistant
          </Typography>
        </Stack>
        <ControlTooltip title="Clear conversation">
          <span>
            <IconButton
              size="small"
              aria-label="Clear assistant conversation"
              disabled={messages.length === 0 || busy}
              onClick={() => clear.mutate()}
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </ControlTooltip>
      </Stack>

      <Box
        sx={{
          minHeight: 200,
          maxHeight: { xs: 420, md: 480 },
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'ao.surface.overlay',
          px: { xs: 1.25, sm: 1.75 },
          py: 1.5,
        }}
      >
        {messages.length === 0 && !streaming ? (
          <Stack spacing={1.25} sx={{ py: 3, px: 1, alignItems: 'flex-start' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: 'ao.accent.secondaryTintStrong',
                  color: 'secondary.main',
                }}
              >
                <AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />
              </Avatar>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                Starters come from your live work queue. Click one to send — nothing else runs until
                you confirm write tools.
              </Typography>
            </Stack>
            <AssistantStarterChips
              disabled={busy}
              onPick={(prompt) => {
                void send(prompt);
              }}
            />
          </Stack>
        ) : (
          <Stack spacing={1.75}>
            {messages.map((message) => (
              <AssistantBubble
                key={message.id}
                message={message}
                streaming={streamingIds.has(message.id)}
              />
            ))}
            {streaming && streamingIds.size === 0 ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: { xs: 0, sm: 4.5 } }}>
                <CircularProgress size={14} color="secondary" />
                <Typography variant="caption" color="text.secondary">
                  Thinking…
                </Typography>
              </Stack>
            ) : null}
            <div ref={bottomRef} />
          </Stack>
        )}
      </Box>

      {streamError ? <Alert severity="error">{streamError}</Alert> : null}

      <TextField
        size="small"
        fullWidth
        multiline
        maxRows={4}
        placeholder="Message assistant…"
        value={draft}
        disabled={streaming}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send(draft);
          }
        }}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 0.5 }}>
                <ControlTooltip title="Send">
                  <span>
                    <IconButton
                      color="secondary"
                      aria-label="Send message"
                      disabled={!draft.trim() || streaming}
                      onClick={() => void send(draft)}
                      edge="end"
                    >
                      {streaming ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <SendIcon fontSize="small" />
                      )}
                    </IconButton>
                  </span>
                </ControlTooltip>
              </InputAdornment>
            ),
            sx: {
              alignItems: 'flex-end',
              borderRadius: 2,
              bgcolor: 'ao.surface.inset',
            },
          },
        }}
      />
    </Stack>
  );
}
