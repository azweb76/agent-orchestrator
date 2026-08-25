import { Box, LinearProgress, Typography } from '@mui/material';
import type { ToolActivityItem } from '@agent-orchestrator/shared';

export type { StreamPart, ToolActivityItem } from '@agent-orchestrator/shared';
export {
  activeToolItem,
  appendStreamText,
  applyStreamEvent,
  coalesceTimelineText,
  extractToolActivity,
} from '@agent-orchestrator/shared';

function toolSummary(item: ToolActivityItem): string {
  return item.detail ? `${item.name}: ${item.detail}` : item.name;
}

function pickActive(items: ToolActivityItem[]): ToolActivityItem | undefined {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!;
    if (item.status === 'running') return item;
  }
  return items[items.length - 1];
}

/**
 * Single indeterminate progress bar that updates with the active tool summary.
 * Does not accumulate a list of past tool events in the chat log.
 */
export function ToolProgressBar({ items }: { items: ToolActivityItem[] }) {
  const active = pickActive(items);
  const label = active ? toolSummary(active) : 'Working…';

  return (
    <Box sx={{ mb: 1.5, maxWidth: 480 }}>
      <LinearProgress
        color="info"
        sx={{
          height: 3,
          borderRadius: 1,
          bgcolor: 'rgba(124,156,255,0.15)',
        }}
      />
      <Typography
        variant="caption"
        component="div"
        color="info.main"
        sx={{
          mt: 0.75,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          lineHeight: 1.35,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={label}
      >
        {label}
      </Typography>
    </Box>
  );
}
