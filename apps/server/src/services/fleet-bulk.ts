import type { MergedFleetAgent } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';

/** Active agents whose linked GitHub pull request has merged. */
export async function listMergedFleetAgents(ctx: AppContext): Promise<MergedFleetAgent[]> {
  const merged: MergedFleetAgent[] = [];

  for (const workspace of ctx.repos.workspaces.list()) {
    for (const worktree of ctx.repos.worktrees.listByWorkspace(workspace.id)) {
      if (!worktree.prNumber) continue;
      const agent = ctx.repos.agents.getByWorktreeId(worktree.id);
      if (!agent || agent.archivedAt) continue;

      try {
        const pr = await ctx.github.getPullRequestDetail(
          workspace.githubOwner,
          workspace.githubRepo,
          worktree.prNumber,
        );
        if (!pr.merged) continue;
        merged.push({
          agentId: agent.id,
          agentName: agent.name,
          workspaceName: workspace.name,
          owner: workspace.githubOwner,
          repo: workspace.githubRepo,
          prNumber: worktree.prNumber,
          prTitle: pr.title,
        });
      } catch {
        // Skip PRs GitHub no longer returns.
      }
    }
  }

  return merged.sort((a, b) => a.agentName.localeCompare(b.agentName));
}
