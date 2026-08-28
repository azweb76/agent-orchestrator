import type {
  MergePullRequestRequest,
  MergePullRequestResponse,
  PullRequestComment,
  PullRequestDetail,
  PullRequestReview,
  UpdatePullRequestBranchResponse,
} from '@agent-orchestrator/shared';
import type { GitHubClientContext } from './client.js';
import { assertPathSegment, prUrl, request } from './client.js';
import { mapPullRequestDetail, mapUser } from './mappers.js';
import { getRepoSettings } from './repos.js';
import type { RawComment, RawPullRequestDetail, RawReview } from './raw-types.js';

export async function createPullRequestReview(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: { event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body?: string },
): Promise<PullRequestReview> {
  const data = await request<RawReview>(ctx, `${prUrl(owner, repo, prNumber)}/reviews`, {
    method: 'POST',
    body: {
      event: body.event,
      ...(body.body?.trim() ? { body: body.body.trim() } : {}),
    },
  });
  invalidatePullRequestCaches(ctx, owner, repo);
  return {
    id: String(data.id),
    author: mapUser(data.user),
    state: data.state,
    body: data.body ?? '',
    htmlUrl: data.html_url ?? null,
    submittedAt: data.submitted_at ?? null,
  };
}

export async function createPullRequestComment(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<PullRequestComment> {
  assertPathSegment(owner, 'owner');
  assertPathSegment(repo, 'repo');
  const data = await request<RawComment>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    { method: 'POST', body: { body } },
  );
  invalidatePullRequestCaches(ctx, owner, repo);
  return {
    id: String(data.id),
    author: mapUser(data.user),
    body: data.body ?? '',
    htmlUrl: data.html_url ?? null,
    createdAt: data.created_at,
  };
}

/**
 * Merge the PR. GitHub answers 405 when it is not mergeable, 409 when the head
 * branch moved since `sha` was captured, and 422 when the method is disabled.
 */
export async function mergePullRequest(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: MergePullRequestRequest,
): Promise<MergePullRequestResponse> {
  const result = await request<{ merged?: boolean; message?: string; sha?: string }>(
    ctx,
    `${prUrl(owner, repo, prNumber)}/merge`,
    {
      method: 'PUT',
      body: {
        merge_method: body.method,
        ...(body.commitTitle ? { commit_title: body.commitTitle } : {}),
        ...(body.commitMessage ? { commit_message: body.commitMessage } : {}),
        ...(body.expectedHeadSha ? { sha: body.expectedHeadSha } : {}),
      },
    },
  );

  invalidatePullRequestCaches(ctx, owner, repo);
  return {
    merged: Boolean(result?.merged),
    message: result?.message ?? 'Pull request merged.',
    sha: result?.sha ?? null,
  };
}

export async function setPullRequestState(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
  state: 'open' | 'closed',
): Promise<PullRequestDetail> {
  const url = prUrl(owner, repo, prNumber);
  const [settings, pr] = await Promise.all([
    getRepoSettings(ctx, owner, repo),
    request<RawPullRequestDetail>(ctx, url, { method: 'PATCH', body: { state } }),
  ]);

  invalidatePullRequestCaches(ctx, owner, repo);
  return mapPullRequestDetail(owner, repo, pr, settings);
}

/**
 * Flip a draft PR to "ready for review". The REST PATCH endpoint silently
 * ignores `draft`, so this requires the GraphQL mutation keyed by node id.
 */
export async function markPullRequestReadyForReview(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestDetail> {
  const url = prUrl(owner, repo, prNumber);
  const [settings, pr] = await Promise.all([
    getRepoSettings(ctx, owner, repo),
    request<RawPullRequestDetail>(ctx, url),
  ]);

  // Already ready: the mutation would fail, so just report the current state.
  if (!pr.draft) return mapPullRequestDetail(owner, repo, pr, settings);
  if (!pr.node_id) throw new Error(`Pull request #${prNumber} is missing a node id`);

  // GraphQL reports failures as 200s with an `errors` array.
  const result = await request<{ errors?: Array<{ message?: string }> }>(
    ctx,
    'https://api.github.com/graphql',
    {
      method: 'POST',
      body: {
        query:
          'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { number } } }',
        variables: { id: pr.node_id },
      },
    },
  );
  if (result?.errors?.length) {
    throw new Error(result.errors[0]?.message ?? 'GitHub could not mark the pull request ready');
  }

  invalidatePullRequestCaches(ctx, owner, repo);
  const updated = await request<RawPullRequestDetail>(ctx, url);
  return mapPullRequestDetail(owner, repo, updated, settings);
}

/**
 * Merge (or rebase, per repo settings) the base branch into the head branch.
 * The 202 only means "queued" — the head sha changes a moment later. A 422
 * means the branch is not behind, or the expected sha no longer matches.
 */
export async function updatePullRequestBranch(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
  expectedHeadSha?: string,
): Promise<UpdatePullRequestBranchResponse> {
  const result = await request<{ message?: string } | undefined>(
    ctx,
    `${prUrl(owner, repo, prNumber)}/update-branch`,
    {
      method: 'PUT',
      body: expectedHeadSha ? { expected_head_sha: expectedHeadSha } : {},
    },
  );

  invalidatePullRequestCaches(ctx, owner, repo);
  return { queued: true, message: result?.message ?? 'Updating pull request branch.' };
}

/**
 * Drop cached branch→PR lookups for a repo after a write, so agent pages do
 * not report stale PR state for the rest of the TTL.
 */
export function invalidatePullRequestCaches(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
): void {
  const prefix = `${owner}/${repo}/`;
  for (const key of ctx.prByBranchCache.keys()) {
    if (key.startsWith(prefix)) {
      ctx.prByBranchCache.delete(key);
    }
  }
}

export async function createPullRequest(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  options: { title: string; body?: string; head: string; base: string; draft?: boolean },
): Promise<{ number: number; htmlUrl: string }> {
  assertPathSegment(owner, 'owner');
  assertPathSegment(repo, 'repo');

  const data = await request<{ number: number; html_url: string }>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: 'POST',
      body: {
        title: options.title,
        body: options.body ?? '',
        head: options.head,
        base: options.base,
        ...(options.draft !== undefined ? { draft: options.draft } : {}),
      },
    },
  );

  return { number: data.number, htmlUrl: data.html_url };
}
