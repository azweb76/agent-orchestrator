import type { AgentDeliveryPhase } from './agent-delivery-phase.js';
import { resolveAgentDeliveryPhase } from './agent-delivery-phase.js';
import type { ChatSession } from './chat-session.js';
import type { AgentStatus } from './types/entities.js';
import type { PrStatusSnapshot, PullRequestChecksRollup } from './types/github.js';

/**
 * Coarse ATC legs for the flight-controller UI.
 * Derived from {@link AgentDeliveryPhase} — not a second workflow engine.
 */
export type AgentFlightLeg = 'boarding' | 'en_route' | 'approach' | 'landed' | 'hangared';

export const AGENT_FLIGHT_LEG_LABELS: Record<AgentFlightLeg, string> = {
  boarding: 'Boarding',
  en_route: 'En route',
  approach: 'Approach',
  landed: 'Landed',
  hangared: 'Hangared',
};

/** Human verbs matching the flight-controller story. */
export const AGENT_FLIGHT_LEG_VERBS: Record<AgentFlightLeg, string> = {
  boarding: 'Planning',
  en_route: 'Implementing',
  approach: 'Verifying',
  landed: 'Merged',
  hangared: 'Archived',
};

const PHASE_TO_LEG: Record<AgentDeliveryPhase, AgentFlightLeg> = {
  planning: 'boarding',
  building: 'en_route',
  needs_pr: 'en_route',
  pr_draft: 'approach',
  awaiting_review: 'approach',
  ready_to_merge: 'approach',
  has_conflicts: 'approach',
  checks_failing: 'approach',
  changes_requested: 'approach',
  merged: 'landed',
  archived: 'hangared',
};

const TURBULENCE_PHASES = new Set<AgentDeliveryPhase>([
  'has_conflicts',
  'checks_failing',
  'changes_requested',
]);

export function resolveAgentFlightLeg(phase: AgentDeliveryPhase): AgentFlightLeg {
  return PHASE_TO_LEG[phase];
}

/** Approach-lane warning chrome (conflicts / CI / review). Same lane as calm approach. */
export function isFlightTurbulence(phase: AgentDeliveryPhase): boolean {
  return TURBULENCE_PHASES.has(phase);
}

/**
 * Whether boarding luggage / engine motion should animate.
 * Idle / stopped agents stay on the apron with luggage paused.
 */
export function isFlightActivityActive(status: AgentStatus | undefined): boolean {
  return status === 'running' || status === 'queued';
}

function checksFromRollup(
  rollup: PullRequestChecksRollup | undefined,
): { rollup: PullRequestChecksRollup; failing: number } | null {
  if (!rollup || rollup === 'none') return null;
  return {
    rollup,
    failing: rollup === 'failure' ? 1 : 0,
  };
}

/**
 * Resolve delivery phase from sidebar/fleet signals (sessions + cached PR snapshot).
 * Snapshot may omit mergeability / review counts; those phases then fall back to
 * draft / awaiting_review / checks_failing — still the correct flight leg.
 */
export function resolveAgentDeliveryPhaseFromPrStatus(input: {
  archived?: boolean;
  agentStatus?: AgentStatus;
  sessions?: readonly Pick<ChatSession, 'template' | 'status' | 'permissionMode'>[];
  needsDraftPr?: boolean;
  prStatus?: PrStatusSnapshot | null;
}): AgentDeliveryPhase {
  const snap = input.prStatus ?? null;
  const pr = snap
    ? {
        state: snap.state,
        merged: snap.merged,
        draft: snap.draft,
        reviewCommentCount: snap.reviewCommentCount ?? 0,
        mergeable: snap.mergeable ?? null,
        mergeableState: snap.mergeableState ?? 'unknown',
      }
    : null;

  return resolveAgentDeliveryPhase({
    archived: input.archived,
    agentStatus: input.agentStatus,
    sessions: input.sessions,
    needsDraftPr: input.needsDraftPr,
    pr,
    checks: snap
      ? (checksFromRollup(snap.checksRollup) ?? {
          rollup: snap.checksRollup,
          failing: snap.checksFailing ?? 0,
        })
      : null,
  });
}
