import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { ControlTooltip } from '../ui/ControlTooltip';
import { MarkdownContent } from './MarkdownContent';
import type { ChatAttachment, ChatTurn } from './types';

interface ChatBubbleProps {
  turn: ChatTurn;
  streaming?: boolean;
  hideBody?: boolean;
  cursor?: boolean;
  gutter?: boolean;
  body?: string;
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
      sx={{ opacity: 0.75, transition: 'opacity 0.15s ease' }}
    >
      {onCopy ? (
        <ControlTooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton size="small" onClick={onCopy} aria-label="Copy message">
            <ContentCopyIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </ControlTooltip>
      ) : null}
      {onRewind ? (
        <ControlTooltip title="Rewind to here">
          <IconButton size="small" onClick={onRewind} aria-label="Rewind to here">
            <HistoryIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </ControlTooltip>
      ) : null}
    </Stack>
  );
}

function Attachments({ attachments }: { attachments?: ChatAttachment[] }) {
  if (!attachments?.length) return null;
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 1 }}>
      {attachments.map((attachment) => {
        const src = attachment.url ?? attachment.previewUrl;
        if (!src) return null;
        return (
          <Box key={attachment.id} component="a" href={src} target="_blank" rel="noreferrer" sx={{ display: 'block' }}>
            <Box
              component="img"
              src={src}
              alt={attachment.name}
              sx={{
                maxWidth: { xs: '100%', sm: 180 },
                maxHeight: 120,
                width: 'auto',
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                objectFit: 'cover',
              }}
            />
          </Box>
        );
      })}
    </Stack>
  );
}

export function ChatBubble({
  turn,
  streaming,
  hideBody,
  cursor,
  gutter = true,
  body,
  onCopy,
  onRetry,
  onRewind,
}: ChatBubbleProps) {
  const isUser = turn.role === 'user';
  const [copied, setCopied] = useState(false);
  const text = body ?? turn.content ?? '';

  const handleCopy = () => {
    onCopy?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const metaBits: string[] = [];
  if (turn.stopped) metaBits.push('Stopped');
  if (turn.costUsd != null) metaBits.push(`$${turn.costUsd.toFixed(4)}`);
  if (turn.durationMs != null) metaBits.push(`${(turn.durationMs / 1000).toFixed(1)}s`);

  if (isUser) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          mb: gutter ? 2 : 0,
          '&:hover .chat-actions, &:focus-within .chat-actions': { opacity: 1 },
        }}
      >
        <Box sx={{ maxWidth: { xs: '100%', sm: 440 }, minWidth: 0 }}>
          <Box
            sx={{
              px: 1.75,
              py: 1.2,
              borderRadius: '16px 16px 5px 16px',
              bgcolor: 'ao.accent.primaryTintStrong',
              border: '1px solid',
              borderColor: 'ao.accent.primaryBorder',
            }}
          >
            <Attachments attachments={turn.attachments} />
            <MarkdownContent content={text} />
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: 0.75 }}>
              <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.8 }}>
                {formatClock(turn.createdAt)}
              </Typography>
              <ActionButtons copied={copied} onCopy={onCopy ? handleCopy : undefined} onRewind={onRewind} />
            </Stack>
          </Box>
        </Box>
      </Box>
    );
  }

  const showBody = !hideBody || Boolean(turn.error);
  const bodyText = text.trim();

  return (
    <Box sx={{ mb: gutter ? 2 : 0, '&:hover .chat-actions, &:focus-within .chat-actions': { opacity: 1 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: showBody ? 1 : 0.25 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Avatar
            sx={{
              width: 22,
              height: 22,
              bgcolor: 'ao.accent.secondaryTintStrong',
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
                '@keyframes ao-live': { '0%, 100%': { opacity: 0.35 }, '50%': { opacity: 1 } },
              }}
              aria-label="Streaming"
            />
          ) : (
            <Typography variant="caption" color="text.secondary">
              {formatClock(turn.createdAt)}
            </Typography>
          )}
        </Stack>
        {!streaming ? <ActionButtons copied={copied} onCopy={onCopy ? handleCopy : undefined} /> : null}
      </Stack>

      {showBody ? (
        <>
          <Attachments attachments={turn.attachments} />
          {hideBody ? null : bodyText ? (
            <MarkdownContent content={text} cursor={cursor ?? Boolean(streaming && text)} />
          ) : streaming || turn.error ? null : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {turn.stopped ? 'Stopped before a reply.' : 'No reply'}
            </Typography>
          )}

          {metaBits.length > 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {metaBits.join(' · ')}
            </Typography>
          ) : null}

          {turn.error ? (
            <Alert
              severity="error"
              sx={{ mt: 1.25 }}
              action={
                onRetry ? (
                  <ControlTooltip title="Retry sending this message">
                    <Button color="inherit" size="small" onClick={onRetry}>
                      Retry
                    </Button>
                  </ControlTooltip>
                ) : undefined
              }
            >
              {turn.error}
            </Alert>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
