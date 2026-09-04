import type { Workspace } from '@agent-orchestrator/shared';
import { BranchExistsError } from './git-errors.js';
import type { AppContext } from './app-context.js';
import { deleteWorktree } from './worktree-delete.js';

async function clearBranchCheckoutForOverwrite(
  ctx: AppContext,
  workspace: Workspace,
  branch: string,
): Promise<void> {
  const existing = ctx.repos.worktrees.getByWorkspaceAndBranch(workspace.id, branch);
  if (existing) {
    await deleteWorktree(ctx, existing.id);
    return;
  }
  const gitPath = await ctx.git.getWorktreePathForBranch(workspace.repoPath, branch);
  if (gitPath) {
    await ctx.git.removeWorktree(workspace.repoPath, gitPath);
  }
}

/** Fetch, optionally overwrite an existing local branch, then add a new-branch worktree. */
export async function addNewBranchWorktree(
  ctx: AppContext,
  workspace: Workspace,
  worktreePath: string,
  branch: string,
  baseBranch: string,
  overwrite?: boolean,
): Promise<void> {
  await ctx.git.fetch(workspace.repoPath);
  const exists = await ctx.git.localBranchExists(workspace.repoPath, branch);
  if (exists && !overwrite) {
    throw new BranchExistsError(branch);
  }
  if (exists && overwrite) {
    await clearBranchCheckoutForOverwrite(ctx, workspace, branch);
  }
  await ctx.git.addWorktree(workspace.repoPath, worktreePath, branch, {
    createBranch: true,
    startRef: `origin/${baseBranch}`,
    overwrite: Boolean(exists && overwrite),
  });
}
