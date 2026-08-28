import { Alert, Box, Button, Chip, Link, Stack, Typography } from '@mui/material';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RemoveCircleOutlinedIcon from '@mui/icons-material/RemoveCircleOutlined';
import type { PullRequestCheck, PullRequestChecks } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../ui/ListPanel';
import { TabState } from './TabState';

const FAILING = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);

function checkIcon(check: PullRequestCheck) {
  if (check.status !== 'completed') return <HourglassEmptyIcon fontSize="small" color="warning" />;
  if (check.conclusion === 'success') return <CheckCircleOutlinedIcon fontSize="small" color="success" />;
  if (check.conclusion && FAILING.has(check.conclusion)) {
    return <CancelOutlinedIcon fontSize="small" color="error" />;
  }
  return <RemoveCircleOutlinedIcon fontSize="small" color="disabled" />;
}

function checkLabel(check: PullRequestCheck): string {
  if (check.status !== 'completed') return check.status === 'queued' ? 'Queued' : 'In progress';
  return check.conclusion ?? 'completed';
}

export interface PullRequestChecksTabProps {
  checks?: PullRequestChecks;
  loading: boolean;
  error: unknown;
  onFixCi?: () => void;
  fixing?: boolean;
}

export function PullRequestChecksTab({
  checks,
  loading,
  error,
  onFixCi,
  fixing,
}: PullRequestChecksTabProps) {
  return (
    <TabState
      loading={loading}
      error={error}
      isEmpty={!checks || checks.checks.length === 0}
      empty={
        <EmptyState
          compact
          title="No checks"
          description="No check runs or commit statuses have reported on this head commit."
        />
      }
    >
      <Stack spacing={1.5}>
        {checks && checks.failing > 0 && onFixCi ? (
          <Alert
            severity="error"
            action={
              <ControlTooltip title="Start a Claude agent to fix failing CI checks" disabled={fixing}>
                <Button color="inherit" size="small" disabled={fixing} onClick={onFixCi}>
                  {fixing ? 'Starting…' : 'Fix CI'}
                </Button>
              </ControlTooltip>
            }
          >
            {checks.failing === 1 ? '1 check is failing.' : `${checks.failing} checks are failing.`}
          </Alert>
        ) : null}
        {checks && checks.truncated ? (
          <Typography variant="caption" color="text.secondary">
            Showing the first {checks.checks.length} of {checks.total} checks.
          </Typography>
        ) : null}
        <ListPanel>
          {checks?.checks.map((check) => (
            <ListRow key={`${check.source}-${check.id}`}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                {checkIcon(check)}
                <ListRowTitle>{check.name}</ListRowTitle>
                <Chip size="small" variant="outlined" label={checkLabel(check)} />
                {check.source === 'status' ? (
                  <Chip size="small" variant="outlined" label="status" />
                ) : null}
              </Stack>
              {check.summary ? <ListRowMeta>{check.summary}</ListRowMeta> : null}
              {check.detailsUrl ? (
                <Box sx={{ mt: 0.5 }}>
                  <Link
                    href={check.detailsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    variant="body2"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                  >
                    Details <OpenInNewIcon sx={{ fontSize: 14 }} />
                  </Link>
                </Box>
              ) : null}
            </ListRow>
          ))}
        </ListPanel>
      </Stack>
    </TabState>
  );
}
