import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import type { ToolActivityItem } from '@agent-orchestrator/shared';

export type { StreamPart, ToolActivityItem } from '@agent-orchestrator/shared';
export {
  appendStreamText,
  applyStreamEvent,
  extractToolActivity,
} from '@agent-orchestrator/shared';

function toolSummary(item: ToolActivityItem): string {
  return item.detail ? `${item.name}: ${item.detail}` : item.name;
}

/**
 * Indeterminate progress bar with a compact line for every tool event summary
 * while the agent is using tools.
 */
export function ToolProgressBar({ items }: { items: ToolActivityItem[] }) {
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
      {items.length > 0 && (
        <Stack spacing={0.35} sx={{ mt: 0.75 }}>
          {items.map((item) => (
            <Typography
              key={item.id}
              variant="caption"
              component="div"
              color={item.status === 'running' ? 'info.main' : 'text.secondary'}
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={toolSummary(item)}
            >
              {toolSummary(item)}
            </Typography>
          ))}
        </Stack>
      )}
    </Box>
  );
}
