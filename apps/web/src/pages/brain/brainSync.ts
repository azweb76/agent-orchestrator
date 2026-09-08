import type { BrainSyncStatus } from '@agent-orchestrator/shared';

export function brainSyncHeadline(status: BrainSyncStatus): string {
  if (!status.configured) return 'Not connected';
  const repo = status.githubOwner && status.githubRepo
    ? `${status.githubOwner}/${status.githubRepo}`
    : status.repoUrl ?? 'library repo';
  if (status.dirty) {
    const n = status.changedFiles.length;
    return `${repo} · ${n} modified file${n === 1 ? '' : 's'}`;
  }
  if (status.behindBy > 0) {
    return `${repo} · ${status.behindBy} commit${status.behindBy === 1 ? '' : 's'} behind`;
  }
  if (status.aheadBy > 0) {
    return `${repo} · ${status.aheadBy} commit${status.aheadBy === 1 ? '' : 's'} ahead of origin`;
  }
  return `${repo} · up to date`;
}
