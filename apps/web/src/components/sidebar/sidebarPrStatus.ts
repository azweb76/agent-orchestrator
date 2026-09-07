import {
  AGENT_DELIVERY_PHASE_LABELS,
  type AgentDeliveryPhase,
  type SidebarAgent,
} from '@agent-orchestrator/shared';
import type { PullRequestStatusKind } from '../pr/pullRequestStatus';
import { resolvePullRequestStatus } from '../pr/pullRequestStatus';
import { formatSidebarBranchCaption, formatSidebarGitCaption } from './sidebarGitStatus';

/**
 * Accurate PR glyph for the sidebar.
 * Prefer cached prStatus; fall back to deliveryPhase when the cache is cold
 * (e.g. right after create, before automation poll).
 */
export function resolveSidebarPrKind(agent: SidebarAgent): PullRequestStatusKind | null {
  if (agent.prStatus) {
    return resolvePullRequestStatus(agent.prStatus);
  }

  if (agent.worktree.prNumber != null) {
    switch (agent.deliveryPhase) {
      case 'pr_draft':
        return 'draft';
      case 'merged':
        return 'merged';
      case 'archived':
        return 'closed';
      default:
        // Linked PR without snapshot — still show a PR glyph (not "open" if we
        // know it's draft from phase; otherwise open is the honest fallback).
        return 'open';
    }
  }

  // Offer to open a draft PR — surface the open glyph so "Needs PR" is visible.
  if (agent.deliveryPhase === 'needs_pr') return 'open';
  return null;
}

/** Phases worth putting on the secondary caption (not idle planning noise). */
export function sidebarPhaseWorthShowing(phase: AgentDeliveryPhase): boolean {
  return phase !== 'planning' && phase !== 'archived';
}

/**
 * Secondary-row caption: branch (+ ahead/behind) · delivery phase when useful.
 * Keeps draft / CI / needs-PR visible without opening the tooltip.
 */
export function formatSidebarStatusCaption(agent: SidebarAgent): string {
  const branch = formatSidebarBranchCaption(agent);
  if (!sidebarPhaseWorthShowing(agent.deliveryPhase)) return branch;
  return `${branch} · ${AGENT_DELIVERY_PHASE_LABELS[agent.deliveryPhase]}`;
}

/** Tooltip / aria lines: git, delivery phase, runtime, PR number. */
export function sidebarAgentStatusLines(agent: SidebarAgent): string[] {
  const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
  const stalled = Boolean(agent.stalled);
  const runtime = needsInput ? 'Needs your input' : stalled ? 'Stalled' : agent.status;
  const lines = [
    formatSidebarGitCaption(agent),
    AGENT_DELIVERY_PHASE_LABELS[agent.deliveryPhase],
    runtime,
  ];
  if (agent.worktree.prNumber != null) {
    const draft = agent.prStatus?.draft || agent.deliveryPhase === 'pr_draft';
    lines.push(draft ? `Draft PR #${agent.worktree.prNumber}` : `PR #${agent.worktree.prNumber}`);
  }
  return lines;
}
