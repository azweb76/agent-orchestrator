import {
  AGENT_DELIVERY_PHASE_LABELS,
  type SidebarAgent,
  type SidebarGitStatus,
} from '@agent-orchestrator/shared';

/** Compact ahead/behind fragment for sidebar captions (e.g. "↑2 ↓1"). */
export function formatAheadBehind(status: Pick<SidebarGitStatus, 'aheadBy' | 'behindBy'>): string {
  const parts: string[] = [];
  if (status.aheadBy > 0) parts.push(`↑${status.aheadBy}`);
  if (status.behindBy > 0) parts.push(`↓${status.behindBy}`);
  return parts.join(' ');
}

/**
 * Secondary-row caption: branch + ahead/behind.
 * Dirty is shown via the M mark so the narrow sidebar does not truncate "dirty".
 */
export function formatSidebarBranchCaption(agent: SidebarAgent): string {
  const branch = agent.worktree.branch || agent.worktree.name || 'no branch';
  const aheadBehind = formatAheadBehind(agent.gitStatus);
  return aheadBehind ? `${branch} · ${aheadBehind}` : branch;
}

/** Full git caption including dirty (tooltips / aria). */
export function formatSidebarGitCaption(agent: SidebarAgent): string {
  const base = formatSidebarBranchCaption(agent);
  return agent.gitStatus.dirty ? `${base} · dirty` : base;
}

/** Tooltip lines covering runtime, delivery, and git. */
export function sidebarAgentStatusLines(agent: SidebarAgent): string[] {
  const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
  const stalled = Boolean(agent.stalled);
  const runtime = needsInput ? 'Needs your input' : stalled ? 'Stalled' : agent.status;
  const lines = [formatSidebarGitCaption(agent), runtime];
  const phase = AGENT_DELIVERY_PHASE_LABELS[agent.deliveryPhase];
  if (phase) lines.push(phase);
  if (agent.worktree.prNumber != null) {
    lines.push(`PR #${agent.worktree.prNumber}`);
  }
  return lines;
}
