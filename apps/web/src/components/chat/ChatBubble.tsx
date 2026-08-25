import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import type { Message } from '@agent-orchestrator/shared';
import { MarkdownContent } from './MarkdownContent';

interface ChatBubbleProps {
  message: Message;
  streaming?: boolean;
  /** Hide markdown body (header still shows) while tools/thinking occupy the turn. */
  hideBody?: boolean;
  /** Override the streaming caret. Defaults to streaming with content. */
  cursor?: boolean;
  /** When false, the parent owns vertical spacing (assistant turns with progress). */
  gutter?: boolean;
  onCopy?: () => void;
  onRetry?: () => void;
  onRewind?: () => void;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function ActionButtons({
  copied,
  onCopy,
  onRewind,
}: {
  copied: boolean;
  onCopy?: () => void;
  onRewind?: () => void;
}) {
  return (
    <Stack
      direction="row"
      spacing={0.15}
      className="chat-actions"
      sx={{
        opacity: { xs: 1, md: 0 },
        transition: 'opacity 0.15s ease',
      }}
    >
      {onCopy ? (
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton size="small" onClick={onCopy} aria-label="Copy message">
            <ContentCopyIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ) : null}
      {onRewind ? (
        <Tooltip title="Rewind to here">
          <IconButton size="small" onClick={onRewind} aria-label="Rewind to here">
            <HistoryIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ) : null}
    </Stack>
  );
}

function Attachments({ message }: { message: Message }) {
  if (!message.attachments?.length) return null;
  return (
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
  );
}

export function ChatBubble({
  message,
  streaming,
  hideBody,
  cursor,
  gutter = true,
  onCopy,
  onRetry,
  onRewind,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const metaBits: string[] = [];
  if (message.metadata?.stopped) metaBits.push('Stopped');
  if (message.metadata?.costUsd != null) {
    metaBits.push(`$${message.metadata.costUsd.toFixed(4)}`);
  }
  if (message.metadata?.durationMs != null) {
    metaBits.push(`${(message.metadata.durationMs / 1000).toFixed(1)}s`);
  }

  if (isUser) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          mb: gutter ? 2.5 : 0,
          '&:hover .chat-actions, &:focus-within .chat-actions': { opacity: 1 },
        }}
      >
        <Box sx={{ position: 'relative', maxWidth: { xs: '92%', sm: '78%' } }}>
          <Box
            sx={{
              position: 'absolute',
              right: '100%',
              top: 6,
              mr: 0.25,
            }}
          >
            <ActionButtons
              copied={copied}
              onCopy={onCopy ? handleCopy : undefined}
              onRewind={onRewind}
            />
          </Box>
          <Box
            sx={{
              px: 1.75,
              py: 1.2,
              borderRadius: '16px 16px 5px 16px',
              bgcolor: 'rgba(139,164,255,0.16)',
              border: '1px solid',
              borderColor: 'rgba(139,164,255,0.26)',
            }}
          >
            <Attachments message={message} />
            <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{message.content}</Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.75, textAlign: 'right', opacity: 0.8 }}
            >
              {formatClock(message.createdAt)}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  const showBody = !hideBody || Boolean(message.metadata?.error);

  return (
    <Box
      sx={{
        mb: gutter ? 2.5 : 0,
        '&:hover .chat-actions, &:focus-within .chat-actions': { opacity: 1 },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: showBody ? 1 : 0.25 }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Avatar
            sx={{
              width: 22,
              height: 22,
              bgcolor: 'rgba(94,234,212,0.14)',
              color: 'secondary.main',
            }}
          >
            <SmartToyOutlinedIcon sx={{ fontSize: 14 }} />
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
            Claude
          </Typography>
          {streaming ? (
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: 'secondary.main',
                animation: 'ao-live 1.2s ease-in-out infinite',
                '@keyframes ao-live': {
                  '0%, 100%': { opacity: 0.35 },
                  '50%': { opacity: 1 },
                },
              }}
              aria-label="Streaming"
            />
          ) : (
            <Typography variant="caption" color="text.secondary">
              {formatClock(message.createdAt)}
            </Typography>
          )}
        </Stack>
        {!streaming ? <ActionButtons copied={copied} onCopy={onCopy ? handleCopy : undefined} /> : null}
      </Stack>

      {showBody ? (
        <>
          <Attachments message={message} />
          {hideBody ? null : (
            <MarkdownContent
              content={message.content || ''}
              cursor={cursor ?? Boolean(streaming && message.content)}
            />
          )}

          {metaBits.length > 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {metaBits.join(' · ')}
            </Typography>
          ) : null}

          {message.metadata?.error ? (
            <Alert
              severity="error"
              sx={{ mt: 1.25 }}
              action={
                onRetry ? (
                  <Button color="inherit" size="small" onClick={onRetry}>
                    Retry
                  </Button>
                ) : undefined
              }
            >
              {message.metadata.error}
            </Alert>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
