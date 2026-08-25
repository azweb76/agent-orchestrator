import { Alert, AlertTitle, Box, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import type {
  MergeReadiness,
  PullRequestChecks,
  PullRequestDetail,
} from '@agent-orchestrator/shared';

const ROLLUP_LABELS: Record<PullRequestChecks['rollup'], { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
  success: { label: 'Checks passing', color: 'success' },
  failure: { label: 'Checks failing', color: 'error' },
  pending: { label: 'Checks running', color: 'warning' },
  neutral: { label: 'Checks neutral', color: 'default' },
  none: { label: 'No checks', color: 'default' },
};

export interface MergeReadinessPanelProps {
  pr: PullRequestDetail;
  readiness: MergeReadiness;
  checks?: PullRequestChecks;
}

export function MergeReadinessPanel({ pr, readiness, checks }: MergeReadinessPanelProps) {
  const rollup = checks ? ROLLUP_LABELS[checks.rollup] : null;

  return (
    <Alert
      severity={readiness.severity}
      icon={readiness.computing ? <CircularProgress size={18} /> : undefined}
    >
      <AlertTitle sx={{ mb: 0.5 }}>{readiness.reason}</AlertTitle>
      <Stack spacing={0.75}>
        {readiness.warning ? (
          <Typography variant="body2" color="text.secondary">
            {readiness.warning}
          </Typography>
        ) : null}
        <Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Chip
              size="small"
              variant="outlined"
              label={`${pr.headRef} → ${pr.baseRef}`}
              sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
            />
            {rollup ? (
              <Chip
                size="small"
                variant="outlined"
                color={rollup.color}
                label={
                  checks && checks.total > 0
                    ? `${rollup.label} (${checks.passing}/${checks.total})`
                    : rollup.label
                }
              />
            ) : null}
            <Chip size="small" variant="outlined" label={`+${pr.additions} −${pr.deletions}`} />
            <Chip
              size="small"
              variant="outlined"
              label={`${pr.changedFiles} ${pr.changedFiles === 1 ? 'file' : 'files'}`}
            />
          </Stack>
        </Box>
      </Stack>
    </Alert>
  );
}
