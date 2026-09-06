import type { WorkspaceSyncStatus } from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';
import { getWorkspace } from './workspaces.js';

async function buildSyncStatus(ctx: AppContext, workspaceId: string): Promise<WorkspaceSyncStatus> {
  const workspace = await getWorkspace(ctx, workspaceId);
  const branch = workspace.defaultBranch;
  const remoteRef = `origin/${branch}`;

  const remoteSha = await ctx.git.resolveSha(workspace.repoPath, remoteRef);
  const localExists = await ctx.git.localBranchExists(workspace.repoPath, branch);
  const localSha = localExists
    ? await ctx.git.resolveSha(workspace.repoPath, branch)
    : null;

  let aheadBy = 0;
  let behindBy = 0;
  if (localSha && remoteSha) {
    const counts = await ctx.git.getAheadBehind(workspace.repoPath, branch, remoteRef);
    aheadBy = counts.ahead;
    behindBy = counts.behind;
  } else if (!localSha && remoteSha) {
    behindBy = 1;
  }

  const checkedOutWorktreePath = await ctx.git.getWorktreePathForBranch(
    workspace.repoPath,
    branch,
  );

  return {
    defaultBranch: branch,
    localSha,
    remoteSha,
    aheadBy,
    behindBy,
    upToDate: Boolean(localSha && remoteSha && behindBy === 0),
    checkedAt: nowIso(),
    defaultBranchCheckedOut: Boolean(checkedOutWorktreePath),
    checkedOutWorktreePath,
  };
}

/** Fetch origin and report whether the local default branch matches `origin/<default>`. */
export async function getWorkspaceSyncStatus(
  ctx: AppContext,
  workspaceId: string,
): Promise<WorkspaceSyncStatus> {
  const workspace = await getWorkspace(ctx, workspaceId);
  await ctx.git.fetch(workspace.repoPath);

  try {
    const remoteDefault = await ctx.git.getDefaultBranch(workspace.repoPath);
    if (remoteDefault && remoteDefault !== workspace.defaultBranch) {
      ctx.repos.workspaces.updateDefaultBranch(workspace.id, remoteDefault);
    }
  } catch {
    // keep stored default branch when origin/HEAD cannot be resolved
  }

  return buildSyncStatus(ctx, workspaceId);
}

/** Fetch and fast-forward the workspace default branch to match origin (default branch only). */
export async function pullWorkspaceDefaultBranch(
  ctx: AppContext,
  workspaceId: string,
): Promise<WorkspaceSyncStatus> {
  const statusBefore = await getWorkspaceSyncStatus(ctx, workspaceId);
  const workspace = await getWorkspace(ctx, workspaceId);
  const branch = workspace.defaultBranch;
  const remoteRef = `origin/${branch}`;
  const remoteSha = await ctx.git.resolveSha(workspace.repoPath, remoteRef);
  if (!remoteSha) {
    throw new Error(`Remote branch ${remoteRef} not found`);
  }

  if (statusBefore.behindBy > 0 || !statusBefore.localSha) {
    await ctx.git.updateBranchToRef(workspace.repoPath, branch, remoteRef);
  }

  return buildSyncStatus(ctx, workspaceId);
}
