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
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { MarkdownContent } from '../chat/MarkdownContent';

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function messageBody(message: AssistantMessage): string {
  if (message.content.trim()) return message.content;
  if (message.toolCalls?.length) {
    return message.toolCalls.map((call) => call.name).join(', ');
  }
  return '…';
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  if (isUser) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Box
          sx={{
            maxWidth: { xs: '92%', sm: '78%' },
            px: 1.75,
            py: 1.15,
            borderRadius: '16px 16px 5px 16px',
            bgcolor: 'ao.accent.primaryTintStrong',
            border: '1px solid',
            borderColor: 'ao.accent.primaryBorder',
          }}
        >
          <Typography
            variant="body2"
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 }}
          >
            {messageBody(message)}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 0.75, textAlign: 'right', opacity: 0.8 }}
          >
            {formatClock(message.createdAt)}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (isTool) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-start', pl: { xs: 0, sm: 4.5 } }}>
        <Box
          sx={{
            maxWidth: { xs: '92%', sm: '85%' },
            px: 1.25,
            py: 0.75,
            borderRadius: 1.5,
            border: '1px dashed',
            borderColor: 'divider',
            bgcolor: 'ao.surface.inset',
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, display: 'block', mb: 0.35 }}
          >
            Tool · {message.toolResult?.toolName ?? 'result'}
            {message.toolResult?.isError ? ' · error' : ''}
          </Typography>
          <Typography
            variant="caption"
            component="pre"
            sx={{
              m: 0,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              fontFamily: 'ui-monospace, monospace',
              opacity: 0.9,
            }}
          >
            {messageBody(message)}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
        <Avatar
          sx={{
            width: 22,
            height: 22,
            bgcolor: 'ao.accent.secondaryTintStrong',
            color: 'secondary.main',
          }}
        >
          <AutoAwesomeOutlinedIcon sx={{ fontSize: 14 }} />
        </Avatar>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.secondary',
          }}
        >
          Assistant
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatClock(message.createdAt)}
        </Typography>
      </Stack>
      <Box sx={{ pl: { xs: 0, sm: 4.5 } }}>
        <MarkdownContent content={messageBody(message)} />
      </Box>
    </Box>
  );
}

export function AssistantChatPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['assistant', 'messages'],
    queryFn: () => api.getAssistantMessages(),
  });

  const chat = useMutation({
    mutationFn: (content: string) => api.assistantChat(content),
    onMutate: (content) => {
      const optimistic: AssistantMessage = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };
      const previous = messagesQuery.data?.messages ?? [];
      queryClient.setQueryData(['assistant', 'messages'], {
        messages: [...previous, optimistic],
      });
      return { previous };
    },
    onError: (_error, _content, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['assistant', 'messages'], { messages: context.previous });
      }
    },
    onSuccess: (result) => {
      const current =
        queryClient.getQueryData<{ messages: AssistantMessage[] }>(['assistant', 'messages'])
          ?.messages ?? [];
      const base = current.filter((msg) => !msg.id.startsWith('optimistic-'));
      queryClient.setQueryData(['assistant', 'messages'], {
        messages: [...base, ...result.messages],
      });
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      const nav = [...result.messages]
        .reverse()
        .find((msg) => msg.toolResult?.navigateTo)?.toolResult?.navigateTo;
      if (nav) navigate(nav);
    },
  });

  const clear = useMutation({
    mutationFn: () => api.clearAssistantMessages(),
    onSuccess: () => {
      queryClient.setQueryData(['assistant', 'messages'], { messages: [] });
    },
  });

  const messages = messagesQuery.data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, chat.isPending]);

  const send = () => {
    const content = draft.trim();
    if (!content || chat.isPending) return;
    setDraft('');
    chat.mutate(content);
  };

  return (
    <Stack spacing={1.25} sx={{ mt: 0.5, maxWidth: 720 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <AutoAwesomeOutlinedIcon sx={{ color: 'secondary.main', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Assistant
          </Typography>
        </Stack>
        <ControlTooltip title="Clear conversation">
          <span>
            <IconButton
              size="small"
              aria-label="Clear assistant conversation"
              disabled={messages.length === 0 || clear.isPending || chat.isPending}
              onClick={() => clear.mutate()}
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </ControlTooltip>
      </Stack>

      <Box
        ref={listRef}
        sx={{
          minHeight: 160,
          maxHeight: 360,
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'ao.surface.overlay',
          px: { xs: 1.25, sm: 1.75 },
          py: 1.5,
        }}
      >
        {messages.length === 0 && !chat.isPending ? (
          <Stack spacing={0.75} sx={{ py: 3, px: 1, alignItems: 'flex-start' }}>
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
                Ask me to start agents, check PRs, or summarize your fleet. Nothing runs until you
                send a message.
              </Typography>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={1.75}>
            {messages.map((message) => (
              <AssistantBubble key={message.id} message={message} />
            ))}
            {chat.isPending ? (
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

      {chat.error ? <Alert severity="error">{(chat.error as Error).message}</Alert> : null}

      <TextField
        size="small"
        fullWidth
        multiline
        maxRows={4}
        placeholder="Message assistant…"
        value={draft}
        disabled={chat.isPending}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
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
                      disabled={!draft.trim() || chat.isPending}
                      onClick={send}
                      edge="end"
                    >
                      {chat.isPending ? (
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
