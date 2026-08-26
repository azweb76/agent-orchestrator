import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import type { ReactNode } from 'react';
import type { ToolActivityItem } from '@agent-orchestrator/shared';
import { toolActionLabel } from './toolPresentation';

export type { StreamPart, ToolActivityItem } from '@agent-orchestrator/shared';
export {
  activeToolItem,
  appendStreamText,
  applyStreamEvent,
  coalesceTimelineText,
  extractToolActivity,
} from '@agent-orchestrator/shared';

function pickActive(items: ToolActivityItem[]): ToolActivityItem | undefined {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!;
    if (item.status === 'running') return item;
  }
  return items[items.length - 1];
}

function toolIcon(name: string): ReactNode {
  switch (name) {
    case 'Read':
      return <DescriptionOutlinedIcon sx={{ fontSize: 16 }} />;
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return <EditOutlinedIcon sx={{ fontSize: 16 }} />;
    case 'Bash':
    case 'BashOutput':
    case 'KillShell':
      return <TerminalIcon sx={{ fontSize: 16 }} />;
    case 'Glob':
    case 'Grep':
    case 'WebSearch':
      return <SearchOutlinedIcon sx={{ fontSize: 16 }} />;
    case 'WebFetch':
      return <LanguageOutlinedIcon sx={{ fontSize: 16 }} />;
    default:
      return <BuildOutlinedIcon sx={{ fontSize: 16 }} />;
  }
}

export function ThinkingIndicator() {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5, pl: 0.25 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }} aria-hidden>
        {[0, 1, 2].map((index) => (
          <Box
            key={index}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'secondary.main',
              animation: 'ao-think 1.15s ease-in-out infinite',
              animationDelay: `${index * 0.16}s`,
              '@keyframes ao-think': {
                '0%, 80%, 100%': { opacity: 0.28, transform: 'translateY(0)' },
                '40%': { opacity: 1, transform: 'translateY(-2px)' },
              },
            }}
          />
        ))}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Thinking
      </Typography>
    </Stack>
  );
}

/**
 * Single in-place activity card for the active tool.
 * Does not accumulate a list of past tool events in the chat log.
 */
export function ToolProgressBar({ items }: { items: ToolActivityItem[] }) {
  const active = pickActive(items);
  const doneCount = items.filter((item) => item.status === 'done').length;
  const label = active ? toolActionLabel(active.name, active.detail) : 'Working';
  const detail = active?.detail?.trim();
  const running = active?.status === 'running';

  return (
    <Box
      sx={{
        mt: 1,
        px: 1.5,
        py: 1.15,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'rgba(139,164,255,0.28)',
        bgcolor: 'rgba(139,164,255,0.06)',
        maxWidth: 560,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'info.main',
            bgcolor: 'rgba(139,164,255,0.12)',
            animation: running ? 'ao-tool-pulse 1.6s ease-in-out infinite' : undefined,
            '@keyframes ao-tool-pulse': {
              '0%, 100%': { boxShadow: '0 0 0 0 rgba(139,164,255,0.35)' },
              '50%': { boxShadow: '0 0 0 5px rgba(139,164,255,0)' },
            },
          }}
          aria-hidden
        >
          {active ? toolIcon(active.name) : <BuildOutlinedIcon sx={{ fontSize: 16 }} />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {label}
            </Typography>
            {doneCount > 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {doneCount} done
              </Typography>
            ) : null}
          </Stack>
          {detail ? (
            <Typography
              variant="caption"
              component="div"
              color="text.secondary"
              title={detail}
              sx={{
                mt: 0.15,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11.5,
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {detail}
            </Typography>
          ) : null}
        </Box>
      </Stack>
      <LinearProgress
        color="info"
        sx={{
          mt: 1.1,
          height: 2.5,
          borderRadius: 1,
          bgcolor: 'rgba(124,156,255,0.14)',
        }}
      />
    </Box>
  );
}
