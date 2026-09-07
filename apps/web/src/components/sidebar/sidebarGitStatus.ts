import type { SidebarAgent, SidebarGitStatus } from '@agent-orchestrator/shared';

/** Compact ahead/behind fragment for sidebar captions (e.g. "↑2 ↓1"). */
export function formatAheadBehind(status: Pick<SidebarGitStatus, 'aheadBy' | 'behindBy'>): string {
  const parts: string[] = [];
  if (status.aheadBy > 0) parts.push(`↑${status.aheadBy}`);
  if (status.behindBy > 0) parts.push(`↓${status.behindBy}`);
  return parts.join(' ');
}

/**
 * Secondary-row branch fragment: branch + ahead/behind.
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
