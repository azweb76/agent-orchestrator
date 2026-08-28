import { Box, Chip, Stack, Tooltip } from '@mui/material';
import type { PullRequestChecksRollup } from '@agent-orchestrator/shared';

export interface PrStatusChipProps {
  /** PR state as reported by GitHub — always 'open' or 'closed' in practice,
   * but callers may have a plain `string` (e.g. PullRequestDetail.state). */
  state: string;
  draft: boolean;
  merged: boolean;
  checksRollup?: PullRequestChecksRollup | null;
  size?: 'small' | 'medium';
}

const CHECKS_ROLLUP_VISUALS: Record<
  Exclude<PullRequestChecksRollup, 'none'>,
  { color: string; label: string }
> = {
  success: { color: 'success.main', label: 'Checks passing' },
  failure: { color: 'error.main', label: 'Checks failing' },
  pending: { color: 'warning.main', label: 'Checks pending' },
  neutral: { color: 'text.disabled', label: 'Checks neutral' },
};

export function PrStatusChip({ state, draft, merged, checksRollup, size = 'small' }: PrStatusChipProps) {
  let stateChip;
  if (merged) {
    stateChip = <Chip size={size} label="Merged" color="secondary" variant="outlined" />;
  } else if (state === 'closed') {
    stateChip = <Chip size={size} label="Closed" color="error" variant="outlined" />;
  } else if (draft) {
    stateChip = <Chip size={size} label="Draft" variant="outlined" />;
  } else {
    stateChip = <Chip size={size} label="Open" color="success" variant="outlined" />;
  }

  const checksVisual = checksRollup && checksRollup !== 'none' ? CHECKS_ROLLUP_VISUALS[checksRollup] : null;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      {stateChip}
      {checksVisual ? (
        <Tooltip title={checksVisual.label}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: checksVisual.color,
              flexShrink: 0,
            }}
          />
        </Tooltip>
      ) : null}
    </Stack>
  );
}
