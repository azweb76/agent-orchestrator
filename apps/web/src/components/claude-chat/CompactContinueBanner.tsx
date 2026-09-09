import { Alert, Button } from '@mui/material';
import { ControlTooltip } from '../ui/ControlTooltip';
import type { ContextUsage } from './types';

export function CompactContinueBanner({
  usage,
  compacting,
  onCompact,
}: {
  usage: ContextUsage;
  compacting?: boolean;
  onCompact: () => void;
}) {
  const percent = Math.round(usage.percent ?? 0);
  return (
    <Alert
      severity="warning"
      sx={{ mb: 1 }}
      action={
        <ControlTooltip title="Summarize this session and continue" disabled={compacting}>
          <Button color="inherit" size="small" disabled={compacting} onClick={onCompact}>
            {compacting ? 'Compacting…' : 'Compact & continue'}
          </Button>
        </ControlTooltip>
      }
    >
      Context is at {percent}% of the window. Summarize this session and continue in a fresh one.
    </Alert>
  );
}
