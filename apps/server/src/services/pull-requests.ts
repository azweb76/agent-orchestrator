import type {
  CreateAgentFromPrRequest,
  CreatePullRequestCommentRequest,
  InboxPullRequest,
  MergePullRequestRequest,
  PullRequestChecks,
  PullRequestDetail,
  PullRequestInbox,
  SetPullRequestStateRequest,
  SubmitPullRequestReviewRequest,
  UpdatePullRequestBranchRequest,
} from '@agent-orchestrator/shared';
import type { SearchedPullRequest } from './github.js';
import { type AppContext, makeEvent } from './app-context.js';
import { createWorkspace } from './workspaces.js';
import { createWorktreeFromPr } from './worktrees.js';
import { resolveLocalPrContext } from './pr-agent-lookup.js';
import { startAutomationTemplate } from './automation-templates.js';

function enrichInboxPullRequest(
  ctx: AppContext,
  pr: SearchedPullRequest,
  category: InboxPullRequest['category'],
): InboxPullRequest {
  const local = resolveLocalPrContextForInbox(ctx, pr.owner, pr.repo, pr.number);

  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    htmlUrl: pr.htmlUrl,
    draft: pr.draft,
    owner: pr.owner,
    repo: pr.repo,
    authorLogin: pr.authorLogin,
    updatedAt: pr.updatedAt,
    category,
    workspaceId: local.workspaceId,
    agentId: local.agentId,
  };
}

export async function getPullRequestInbox(ctx: AppContext): Promise<PullRequestInbox> {
  const [authored, reviewRequested] = await Promise.all([
    ctx.github.listAuthoredOpenPullRequests(),
    ctx.github.listReviewRequestedPullRequests(),
  ]);

  const archivedRepos = await resolveArchivedRepos(ctx, [...authored, ...reviewRequested]);
  const notArchived = (pr: SearchedPullRequest) => !archivedRepos.has(`${pr.owner}/${pr.repo}`);

  return {
    authored: authored.filter(notArchived).map((pr) => enrichInboxPullRequest(ctx, pr, 'authored')),
    reviewRequested: reviewRequested
      .filter(notArchived)
      .map((pr) => enrichInboxPullRequest(ctx, pr, 'review_requested')),
  };
}

/**
 * Resolve which of the given PRs' repos are archived on GitHub, deduping so each
 * unique repo is only looked up once. Fails open per repo: an inaccessible/flaky
 * repo is treated as not archived so it can't take down the whole inbox response.
 */
async function resolveArchivedRepos(
  ctx: AppContext,
  prs: SearchedPullRequest[],
): Promise<Set<string>> {
  const uniqueRepos = [...new Set(prs.map((pr) => `${pr.owner}/${pr.repo}`))];
  const archived = new Set<string>();
  await Promise.all(
    uniqueRepos.map(async (key) => {
      const [owner, repo] = key.split('/');
      try {
        if (await ctx.github.isRepoArchived(owner, repo)) archived.add(key);
      } catch {
        // Fail open: an inaccessible/flaky repo should not drop other PRs from the inbox.
      }
    }),
  );
  return archived;
}

/**
 * Local workspace/agent overlay for a GitHub PR, if this app already tracks it.
 * Shared by the inbox and the PR detail page so there is one lookup path.
 */
function resolveLocalPrContextForInbox(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
): { workspaceId: string | null; agentId: string | null } {
  const local = resolveLocalPrContext(ctx, owner, repo, prNumber);
  return { workspaceId: local.workspaceId, agentId: local.agentId };
}

/** Record a PR lifecycle event on the local agent for this PR, when there is one. */
function recordPullRequestEvent(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  type: string,
  data: Record<string, unknown>,
): void {
  const { agentId } = resolveLocalPrContextForInbox(ctx, owner, repo, prNumber);
  if (!agentId) return;
  ctx.repos.events.create(makeEvent(agentId, type, data));
}

export async function getPullRequestDetail(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestDetail> {
  const pr = await ctx.github.getPullRequestDetail(owner, repo, prNumber);
  return {
    ...pr,
    ...resolveLocalPrContext(ctx, owner, repo, prNumber, pr.headRef),
  };
}

export async function getPullRequestChecks(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestChecks> {
  // Resolve the head sha server-side so the client cannot ask for an arbitrary commit.
  const pr = await ctx.github.getPullRequestDetail(owner, repo, prNumber);
  return ctx.github.getPullRequestChecks(owner, repo, pr.headSha);
}

export async function getPullRequestReviews(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
) {
  return ctx.github.listPullRequestReviews(owner, repo, prNumber);
}

export async function getPullRequestFiles(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
) {
  return ctx.github.listPullRequestFiles(owner, repo, prNumber);
}

export async function getPullRequestCommits(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
) {
  return ctx.github.listPullRequestCommits(owner, repo, prNumber);
}

export async function getPullRequestComments(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
) {
  return ctx.github.listPullRequestComments(owner, repo, prNumber);
}

export async function submitPullRequestReview(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: SubmitPullRequestReviewRequest,
) {
  const text = body.body?.trim() ?? '';
  if (body.event !== 'APPROVE' && !text) {
    throw new Error('A review body is required when requesting changes or commenting');
  }
  const review = await ctx.github.createPullRequestReview(owner, repo, prNumber, {
    event: body.event,
    body: text || undefined,
  });
  recordPullRequestEvent(ctx, owner, repo, prNumber, 'pr_reviewed', {
    number: prNumber,
    event: body.event,
    reviewId: review.id,
  });
  return review;
}

export async function createPullRequestComment(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: CreatePullRequestCommentRequest,
) {
  const text = body.body.trim();
  if (!text) throw new Error('Comment body is required');
  const comment = await ctx.github.createPullRequestComment(owner, repo, prNumber, text);
  recordPullRequestEvent(ctx, owner, repo, prNumber, 'pr_commented', {
    number: prNumber,
    commentId: comment.id,
  });
  return comment;
}

export async function mergePullRequest(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: MergePullRequestRequest,
) {
  // Always pin the merge to a head sha so a concurrent push 409s instead of
  // merging commits nobody reviewed.
  const expectedHeadSha =
    body.expectedHeadSha ?? (await ctx.github.getPullRequestDetail(owner, repo, prNumber)).headSha;

  const result = await ctx.github.mergePullRequest(owner, repo, prNumber, { ...body, expectedHeadSha });

  recordPullRequestEvent(ctx, owner, repo, prNumber, 'pr_merged', {
    number: prNumber,
    method: body.method,
    sha: result.sha,
  });

  return result;
}

export async function setPullRequestState(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: SetPullRequestStateRequest,
): Promise<PullRequestDetail> {
  const pr = await ctx.github.setPullRequestState(owner, repo, prNumber, body.state);

  recordPullRequestEvent(
    ctx,
    owner,
    repo,
    prNumber,
    body.state === 'closed' ? 'pr_closed' : 'pr_reopened',
    { number: prNumber },
  );

  return {
    ...pr,
    ...resolveLocalPrContext(ctx, owner, repo, prNumber, pr.headRef),
  };
}

export async function markPullRequestReady(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestDetail> {
  const pr = await ctx.github.markPullRequestReadyForReview(owner, repo, prNumber);

  recordPullRequestEvent(ctx, owner, repo, prNumber, 'pr_ready_for_review', { number: prNumber });

  return {
    ...pr,
    ...resolveLocalPrContext(ctx, owner, repo, prNumber, pr.headRef),
  };
}

export async function updatePullRequestBranch(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: UpdatePullRequestBranchRequest,
) {
  return ctx.github.updatePullRequestBranch(owner, repo, prNumber, body.expectedHeadSha);
}

export async function createAgentFromPullRequest(ctx: AppContext, body: CreateAgentFromPrRequest) {
  let workspace = ctx.repos.workspaces.getByOwnerRepo(body.owner, body.repo);

  if (!workspace) {
    workspace = await createWorkspace(ctx, {
      repoUrl: `https://github.com/${body.owner}/${body.repo}`,
      name: body.repo,
    });
  }

  const pr = await ctx.github.getPullRequest(body.owner, body.repo, body.prNumber);
  const local = resolveLocalPrContext(ctx, body.owner, body.repo, body.prNumber, pr.headRef);

  if (local.agentId && local.worktreeId) {
    const worktree = ctx.repos.worktrees.getById(local.worktreeId)!;
    const agent = ctx.repos.agents.getById(local.agentId)!;
    let sessionId: string | null = null;
    if (body.template) {
      const session = await startAutomationTemplate(ctx, agent.id, body.template);
      sessionId = session?.id ?? null;
    }
    return {
      workspace,
      worktree,
      agent,
      created: false as const,
      reused: true as const,
      sessionId,
    };
  }

  const { worktree, agent } = await createWorktreeFromPr(ctx, workspace.id, {
    prNumber: body.prNumber,
    name: body.name,
  });

  let sessionId: string | null = null;
  if (body.template) {
    const session = await startAutomationTemplate(ctx, agent.id, body.template);
    sessionId = session?.id ?? null;
  }

  return {
    workspace,
    worktree,
    agent,
    created: true as const,
    reused: false as const,
    sessionId,
  };
}
