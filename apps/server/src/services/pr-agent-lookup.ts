import type { AppContext } from './app-context.js';

export interface LocalPrContext {
  workspaceId: string | null;
  worktreeId: string | null;
  agentId: string | null;
}

/**
 * Local workspace/agent overlay for a GitHub PR, if this app already tracks it.
 * Matches by stored PR number or by branch name (PR head ref).
 */
export function resolveLocalPrContext(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  headRef?: string,
): LocalPrContext {
  const workspace = ctx.repos.workspaces.getByOwnerRepo(owner, repo);
  if (!workspace) {
    return { workspaceId: null, worktreeId: null, agentId: null };
  }

  let worktree = ctx.repos.worktrees.getByWorkspaceAndPr(workspace.id, prNumber);
  if (!worktree && headRef) {
    worktree = ctx.repos.worktrees.getByWorkspaceAndBranch(workspace.id, headRef);
  }

  const agent = worktree ? ctx.repos.agents.getByWorktreeId(worktree.id) : null;
  return {
    workspaceId: workspace.id,
    worktreeId: worktree?.id ?? null,
    agentId: agent?.id ?? null,
  };
}
