import { Box, LinearProgress } from '@mui/material';

export type { StreamPart, ToolActivityItem } from '@agent-orchestrator/shared';
export {
  appendStreamText,
  applyStreamEvent,
  extractToolActivity,
} from '@agent-orchestrator/shared';

/** Compact indeterminate bar shown while the agent is using tools. */
export function ToolProgressBar() {
  return (
    <Box sx={{ mb: 1.5, maxWidth: 360 }}>
      <LinearProgress
        color="info"
        sx={{
          height: 3,
          borderRadius: 1,
          bgcolor: 'rgba(124,156,255,0.15)',
        }}
      />
    </Box>
  );
}
