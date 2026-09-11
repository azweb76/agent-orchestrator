import { Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import CallMergeOutlinedIcon from '@mui/icons-material/CallMergeOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import type { AgentDetail } from '@agent-orchestrator/shared';
import { PullRequestStatusChip } from '../pr/PullRequestStatusChip';
import { ControlTooltip } from '../ui/ControlTooltip';
import {
  buildAgentPrStatusSummary,
  type AgentPrKickoffTemplate,
} from './agentPrStatusSummary';
import { useAgentLinkedPr } from './useAgentLinkedPr';

export interface AgentPrStatusStripProps {
  agent: AgentDetail;
  archived?: boolean;
  kickoffPending?: boolean;
  onStartKickoff?: (template: AgentPrKickoffTemplate) => void;
  onOpenPrTab?: () => void;
}

const KICKOFF_UI: Record<
  AgentPrKickoffTemplate,
  { label: string; tooltip: string; color: 'error' | 'warning'; icon: typeof CallMergeOutlinedIcon }
> = {
  'resolve-conflicts': {
    label: 'Resolve conflicts',
    tooltip: 'Start a resolve-conflicts session on this agent',
    color: 'error',
    icon: CallMergeOutlinedIcon,
  },
  'fix-ci': {
    label: 'Fix CI',
    tooltip: 'Start a fix-ci session on this agent',
    color: 'error',
    icon: BugReportOutlinedIcon,
  },
  'address-review': {
    label: 'Address review',
    tooltip: 'Start an address-review session on this agent',
    color: 'warning',
    icon: ReplyOutlinedIcon,
  },
};

/** Compact PR health chips shown under the agent header when a PR is linked. */
export function AgentPrStatusStrip({
  agent,
  archived = false,
  kickoffPending = false,
  onStartKickoff,
  onOpenPrTab,
}: AgentPrStatusStripProps) {
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

  const model = buildAgentPrStatusSummary({
    pr,
    checks,
    archived,
    sessions: agent.sessions,
  });

  return (
    <Stack
      direction="row"
      spacing={0.75}
      useFlexGap
      sx={{ alignItems: 'center', flexWrap: 'wrap', minWidth: 0, px: 0.25 }}
    >
      <PullRequestStatusChip status={model.prStatus} onClick={onOpenPrTab} />
      {model.conflicted ? (
        <Chip
          size="small"
          color="error"
          variant="outlined"
          label="Conflicts"
          onClick={onOpenPrTab}
        />
      ) : model.mergeLabel && model.mergeLabel !== 'Draft' ? (
        <Chip
          size="small"
          variant="outlined"
          color={model.mergeTone === 'default' ? undefined : model.mergeTone}
          label={model.mergeLabel}
          onClick={onOpenPrTab}
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
          onClick={onOpenPrTab}
        />
      ) : checksQuery.isLoading ? (
        <Chip size="small" variant="outlined" label="Checks…" onClick={onOpenPrTab} />
      ) : null}
      {model.reviewLabel ? (
        <Chip size="small" variant="outlined" label={model.reviewLabel} onClick={onOpenPrTab} />
      ) : null}
      {onStartKickoff
        ? model.kickoffs.map((template) => {
            const ui = KICKOFF_UI[template];
            const Icon = ui.icon;
            return (
              <ControlTooltip key={template} title={ui.tooltip} disabled={kickoffPending}>
                <Button
                  size="small"
                  variant="outlined"
                  color={ui.color}
                  disabled={kickoffPending}
                  startIcon={<Icon fontSize="small" />}
                  onClick={() => onStartKickoff(template)}
                  sx={{ textTransform: 'none', minHeight: 28, py: 0 }}
                >
                  {ui.label}
                </Button>
              </ControlTooltip>
            );
          })
        : null}
    </Stack>
  );
}
