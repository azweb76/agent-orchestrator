import { Chip, CircularProgress, Stack, Typography } from '@mui/material';
import type { AgentDetail } from '@agent-orchestrator/shared';
import { PullRequestStatusChip } from '../pr/PullRequestStatusChip';
import { buildAgentPrStatusSummary } from './agentPrStatusSummary';
import { useAgentLinkedPr } from './useAgentLinkedPr';

export interface AgentPrStatusStripProps {
  agent: AgentDetail;
}

/** Compact PR health chips shown under the agent header when a PR is linked. */
export function AgentPrStatusStrip({ agent }: AgentPrStatusStripProps) {
  const { enabled, prNumber, prQuery, checksQuery, pr, checks } = useAgentLinkedPr(agent);

  if (!enabled || prNumber == null) return null;

  if (prQuery.isLoading) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 0.25, py: 0.25 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Loading PR #{prNumber}…
        </Typography>
      </Stack>
    );
  }

  if (prQuery.error || !pr) {
    return (
      <Typography variant="caption" color="warning.main" sx={{ px: 0.25 }}>
        PR #{prNumber} unavailable: {(prQuery.error as Error)?.message ?? 'unknown error'}
      </Typography>
    );
  }

  const model = buildAgentPrStatusSummary({ pr, checks });

  return (
    <Stack
      direction="row"
      spacing={0.75}
      useFlexGap
      sx={{ alignItems: 'center', flexWrap: 'wrap', minWidth: 0, px: 0.25 }}
    >
      <PullRequestStatusChip status={model.prStatus} />
      {model.conflicted ? (
        <Chip size="small" color="error" variant="outlined" label="Conflicts" />
      ) : model.mergeLabel && model.mergeLabel !== 'Draft' ? (
        <Chip
          size="small"
          variant="outlined"
          color={model.mergeTone === 'default' ? undefined : model.mergeTone}
          label={model.mergeLabel}
        />
      ) : null}
      {model.checksLabel ? (
        <Chip
          size="small"
          variant="outlined"
          color={
            model.checksTone === 'default' || model.conflicted ? undefined : model.checksTone
          }
          label={model.checksLabel}
        />
      ) : checksQuery.isLoading ? (
        <Chip size="small" variant="outlined" label="Checks…" />
      ) : null}
      {model.reviewLabel ? (
        <Chip size="small" variant="outlined" label={model.reviewLabel} />
      ) : null}
    </Stack>
  );
}
