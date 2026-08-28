import type { AppContext } from './app-context.js';

export interface PollTarget {
  owner: string;
  repo: string;
  number: number;
  agentId: string | null;
  worktreeId: string | null;
  /** Whether this PR was opened by the authenticated user (inbox authored). */
  authored: boolean;
  /** Whether a review was requested from the authenticated user. */
  reviewRequested: boolean;
}

function targetKey(target: Pick<PollTarget, 'owner' | 'repo' | 'number'>): string {
  return `${target.owner}/${target.repo}#${target.number}`;
}

/**
 * Collect unique PRs to poll: linked agent worktrees plus authored inbox PRs.
 * Does not scan every repo on GitHub.
 */
export async function collectPollTargets(ctx: AppContext): Promise<PollTarget[]> {
  const map = new Map<string, PollTarget>();

  for (const workspace of ctx.repos.workspaces.list()) {
    for (const worktree of ctx.repos.worktrees.listByWorkspace(workspace.id)) {
      if (!worktree.prNumber) continue;
      const agent = ctx.repos.agents.getByWorktreeId(worktree.id);
      const key = targetKey({ owner: workspace.githubOwner, repo: workspace.githubRepo, number: worktree.prNumber });
      map.set(key, {
        owner: workspace.githubOwner,
        repo: workspace.githubRepo,
        number: worktree.prNumber,
        agentId: agent?.id ?? null,
        worktreeId: worktree.id,
        authored: false,
        reviewRequested: false,
      });
    }
  }

  try {
    const [authored, reviewRequested] = await Promise.all([
      ctx.github.listAuthoredOpenPullRequests(),
      ctx.github.listReviewRequestedPullRequests(),
    ]);

    for (const pr of authored) {
      const key = targetKey(pr);
      const existing = map.get(key);
      if (existing) {
        existing.authored = true;
        continue;
      }
      const workspace = ctx.repos.workspaces.getByOwnerRepo(pr.owner, pr.repo);
      const worktree = workspace
        ? ctx.repos.worktrees.getByWorkspaceAndPr(workspace.id, pr.number)
        : null;
      const agent = worktree ? ctx.repos.agents.getByWorktreeId(worktree.id) : null;
      map.set(key, {
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        agentId: agent?.id ?? null,
        worktreeId: worktree?.id ?? null,
        authored: true,
        reviewRequested: false,
      });
    }

    for (const pr of reviewRequested) {
      const key = targetKey(pr);
      const existing = map.get(key);
      if (existing) {
        existing.reviewRequested = true;
        continue;
      }
      const workspace = ctx.repos.workspaces.getByOwnerRepo(pr.owner, pr.repo);
      const worktree = workspace
        ? ctx.repos.worktrees.getByWorkspaceAndPr(workspace.id, pr.number)
        : null;
      const agent = worktree ? ctx.repos.agents.getByWorktreeId(worktree.id) : null;
      map.set(key, {
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        agentId: agent?.id ?? null,
        worktreeId: worktree?.id ?? null,
        authored: false,
        reviewRequested: true,
      });
    }
  } catch (error) {
    console.warn('[automation] failed to list inbox PRs for poll targets:', error);
  }

  return [...map.values()];
}

export { targetKey as pollTargetKey };
