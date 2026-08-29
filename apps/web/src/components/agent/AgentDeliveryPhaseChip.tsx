import { Chip } from '@mui/material';
import ArchitectureOutlinedIcon from '@mui/icons-material/ArchitectureOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import {
  AGENT_DELIVERY_PHASE_LABELS,
  resolveAgentDeliveryPhase,
  type AgentDetail,
  type AgentDeliveryPhase,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { PullRequestStatusIcon } from '../pr/PullRequestStatusIcon';
import { useAgentLinkedPr } from './useAgentLinkedPr';
import type { ReactElement } from 'react';

function phaseColor(
  phase: AgentDeliveryPhase,
): 'default' | 'info' | 'warning' | 'error' | 'success' | 'secondary' {
  switch (phase) {
    case 'checks_failing':
    case 'changes_requested':
      return 'error';
    case 'needs_pr':
    case 'building':
      return 'warning';
    case 'ready_to_merge':
    case 'merged':
      return 'success';
    case 'pr_draft':
    case 'awaiting_review':
      return 'info';
    case 'archived':
      return 'secondary';
    default:
      return 'default';
  }
}

function phaseIcon(phase: AgentDeliveryPhase): ReactElement {
  const sx = { ml: 0.5, fontSize: 16 };
  switch (phase) {
    case 'pr_draft':
      return <PullRequestStatusIcon status="draft" sx={sx} />;
    case 'merged':
      return <PullRequestStatusIcon status="merged" sx={sx} />;
    case 'ready_to_merge':
    case 'awaiting_review':
    case 'needs_pr':
      return <PullRequestStatusIcon status="open" sx={sx} />;
    case 'checks_failing':
      return <BugReportOutlinedIcon sx={sx} />;
    case 'changes_requested':
      return <RateReviewOutlinedIcon sx={sx} />;
    case 'building':
      return <BuildOutlinedIcon sx={sx} />;
    case 'archived':
      return <ArchiveOutlinedIcon sx={sx} />;
    case 'planning':
    default:
      return <ArchitectureOutlinedIcon sx={sx} />;
  }
}

export interface AgentDeliveryPhaseChipProps {
  agent: AgentDetail;
  archived: boolean;
}

/** Header chip for the derived PR-delivery phase (plan → merged). */
export function AgentDeliveryPhaseChip({ agent, archived }: AgentDeliveryPhaseChipProps) {
  const { pr, checks } = useAgentLinkedPr(agent);
  const phase = resolveAgentDeliveryPhase({
    archived,
    agentStatus: agent.status,
    sessions: agent.sessions,
    needsDraftPr: Boolean(agent.draftPrOffer),
    pr: pr ?? null,
    checks: checks ?? null,
  });
  const color = phaseColor(phase);

  return (
    <ControlTooltip title="Where this agent is on the path to a merged pull request">
      <Chip
        size="small"
        variant="outlined"
        color={color === 'default' ? undefined : color}
        icon={phaseIcon(phase)}
        label={AGENT_DELIVERY_PHASE_LABELS[phase]}
      />
    </ControlTooltip>
  );
}
