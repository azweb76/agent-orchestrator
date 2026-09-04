import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import SendIcon from '@mui/icons-material/Send';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssistantMessage } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';

function messageLabel(message: AssistantMessage): string {
  if (message.role === 'user') return 'You';
  if (message.role === 'tool') return `Tool · ${message.toolResult?.toolName ?? 'result'}`;
  return 'Assistant';
}

export function AssistantChatPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['assistant', 'messages'],
    queryFn: () => api.getAssistantMessages(),
  });

  const chat = useMutation({
    mutationFn: (content: string) => api.assistantChat(content),
    onSuccess: (result) => {
      queryClient.setQueryData(['assistant', 'messages'], {
        messages: [...(messagesQuery.data?.messages ?? []), ...result.messages],
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
    <Stack spacing={1} sx={{ pl: { xs: 0, sm: 4 }, maxWidth: 720 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" color="text.secondary">
          Ask Assistant
        </Typography>
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

      {messages.length > 0 ? (
        <Box
          sx={{
            maxHeight: 240,
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'ao.surface.overlay',
            px: 1.25,
            py: 1,
          }}
        >
          <Stack spacing={1}>
            {messages.map((message) => (
              <Box key={message.id}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, display: 'block' }}
                >
                  {messageLabel(message)}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    opacity: message.role === 'tool' ? 0.85 : 1,
                    fontFamily: message.role === 'tool' ? 'ui-monospace, monospace' : undefined,
                    fontSize: message.role === 'tool' ? '0.75rem' : undefined,
                  }}
                >
                  {message.content ||
                    (message.toolCalls?.length
                      ? message.toolCalls.map((call) => call.name).join(', ')
                      : '…')}
                </Typography>
              </Box>
            ))}
            <div ref={bottomRef} />
          </Stack>
        </Box>
      ) : null}

      {chat.error ? (
        <Alert severity="error">{(chat.error as Error).message}</Alert>
      ) : null}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={4}
          placeholder="e.g. Create an agent in demo to add dark mode"
          value={draft}
          disabled={chat.isPending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <Button
          variant="contained"
          color="secondary"
          disabled={!draft.trim() || chat.isPending}
          onClick={send}
          startIcon={
            chat.isPending ? <CircularProgress size={14} color="inherit" /> : <SendIcon />
          }
          sx={{ flexShrink: 0, mt: 0.25 }}
        >
          Send
        </Button>
      </Stack>
    </Stack>
  );
}
