import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
import type { Message } from '@agent-orchestrator/shared';
import { MarkdownContent } from './MarkdownContent';

interface ChatBubbleProps {
  message: Message;
  streaming?: boolean;
  onCopy?: () => void;
  onRetry?: () => void;
  onRewind?: () => void;
}

export function ChatBubble({
  message,
  streaming,
  onCopy,
  onRetry,
  onRewind,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const metaBits: string[] = [];
  if (message.metadata?.stopped) metaBits.push('stopped');
  if (message.metadata?.costUsd != null) {
    metaBits.push(`$${message.metadata.costUsd.toFixed(4)}`);
  }
  if (message.metadata?.durationMs != null) {
    metaBits.push(`${(message.metadata.durationMs / 1000).toFixed(1)}s`);
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        mb: 1.5,
      }}
    >
      <Paper
        sx={{
          p: 1.5,
          maxWidth: { xs: '100%', md: '82%' },
          width: isUser ? 'auto' : '100%',
          bgcolor: isUser ? 'primary.dark' : 'rgba(255,255,255,0.04)',
          borderColor: isUser ? 'primary.main' : 'divider',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {isUser ? 'You' : 'Claude'}
            {streaming ? ' • streaming' : ''} • {new Date(message.createdAt).toLocaleTimeString()}
            {metaBits.length > 0 ? ` • ${metaBits.join(' • ')}` : ''}
          </Typography>
          {!streaming && (
            <Stack direction="row" spacing={0.25}>
              {onCopy && (
                <Tooltip title="Copy">
                  <IconButton size="small" onClick={onCopy}>
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              )}
              {isUser && onRewind && (
                <Tooltip title="Rewind to here">
                  <IconButton size="small" onClick={onRewind} aria-label="Rewind to here">
                    <HistoryIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          )}
        </Stack>

        {message.attachments?.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 1 }}>
            {message.attachments.map((attachment) => (
              <Box
                key={attachment.id}
                component="a"
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                sx={{ display: 'block' }}
              >
                <Box
                  component="img"
                  src={attachment.url}
                  alt={attachment.name}
                  sx={{
                    maxWidth: 180,
                    maxHeight: 120,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    objectFit: 'cover',
                  }}
                />
              </Box>
            ))}
          </Stack>
        )}

        {isUser ? (
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>
        ) : (
          <MarkdownContent content={message.content || (streaming ? '…' : '')} />
        )}

        {message.metadata?.error && (
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            <Typography variant="body2" color="error">
              {message.metadata.error}
            </Typography>
            {onRetry && (
              <Button size="small" variant="outlined" color="error" onClick={onRetry}>
                Retry
              </Button>
            )}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
