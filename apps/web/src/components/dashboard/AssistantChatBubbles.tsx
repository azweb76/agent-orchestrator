import {
  Avatar,
  Box,
  Stack,
  Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import type { AssistantMessage } from '@agent-orchestrator/shared';
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

export function AssistantBubble({
  message,
  streaming = false,
}: {
  message: AssistantMessage;
  streaming?: boolean;
}) {
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
          {streaming ? 'streaming…' : formatClock(message.createdAt)}
        </Typography>
      </Stack>
      <Box sx={{ pl: { xs: 0, sm: 4.5 } }}>
        {message.content.trim() ? (
          <MarkdownContent content={messageBody(message)} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            …
          </Typography>
        )}
      </Box>
    </Box>
  );
}
