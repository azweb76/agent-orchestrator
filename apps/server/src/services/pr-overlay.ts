import type { Worktree } from '@agent-orchestrator/shared';

/**
 * Merges a live GitHub PR (looked up by branch) onto a worktree.
 * When no live PR is found, preserves any DB-stored association — important for
 * agents created from a PR whose local branch is `pr-<n>` rather than the remote
 * head ref, which would otherwise clear prNumber and resurface "Create PR".
 */
export function mergeLivePullRequest(
  worktree: Worktree,
  pr: { number: number; title: string } | null,
): Worktree {
  if (!pr) return worktree;
  return { ...worktree, prNumber: pr.number, prTitle: pr.title };
}
