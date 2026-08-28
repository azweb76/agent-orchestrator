import { Chip } from '@mui/material';
import {
  AGENT_DELIVERY_PHASE_LABELS,
  resolveAgentDeliveryPhase,
  type AgentDetail,
  type AgentDeliveryPhase,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { useAgentLinkedPr } from './useAgentLinkedPr';

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
        label={AGENT_DELIVERY_PHASE_LABELS[phase]}
      />
    </ControlTooltip>
  );
}
