import type {
  GitHubBranch,
  GitHubPullRequest,
  PullRequestCheck,
  PullRequestChecks,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetail,
  PullRequestFiles,
  PullRequestReview,
  PullRequestReviewComment,
} from '@agent-orchestrator/shared';
import { parsePullRequestNumber, rollupChecks } from '@agent-orchestrator/shared';
import { searchPullRequests } from './auth.js';
import {
  DEFAULT_MERGEABILITY_RETRY_DELAY_MS,
  FAILING_CONCLUSIONS,
  MAX_CHECK_RUN_PAGES,
  MERGEABILITY_RETRIES,
  PR_BY_BRANCH_CACHE_TTL_MS,
} from './constants.js';
import type { GitHubClientContext } from './client.js';
import { assertPathSegment, prUrl, request, sleep } from './client.js';
import {
  isMergeabilityPending,
  mapCheckRun,
  mapCommitStatus,
  mapPullRequest,
  mapPullRequestDetail,
  mapSearchedPullRequest,
  mapUser,
  sanitizePullRequestSearchText,
} from './mappers.js';
import { getRepoSettings } from './repos.js';
import type {
  RawCheckRun,
  RawComment,
  RawCommit,
  RawCommitStatus,
  RawFile,
  RawPullRequest,
  RawPullRequestDetail,
  RawReview,
  RawReviewComment,
} from './raw-types.js';

export async function listBranches(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
): Promise<GitHubBranch[]> {
  const data = await request<Array<{ name: string; commit: { sha: string }; protected: boolean }>>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
  );
  return data.map((branch) => ({
    name: branch.name,
    sha: branch.commit.sha,
    protected: branch.protected,
  }));
}

export async function listPullRequests(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open',
): Promise<GitHubPullRequest[]> {
  const data = await request<RawPullRequest[]>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=100`,
  );

  return data.map(mapPullRequest);
}

/**
 * Search pull requests in a repo (open and closed). Empty query lists open PRs.
 * A bare number / `#N` / GitHub URL also tries the direct PR endpoint so private
 * PRs that search misses still resolve.
 */
export async function searchRepositoryPullRequests(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  query: string,
): Promise<GitHubPullRequest[]> {
  assertPathSegment(owner, 'owner');
  assertPathSegment(repo, 'repo');

  const trimmed = query.trim();
  if (!trimmed) {
    return listPullRequests(ctx, owner, repo);
  }

  const number = parsePullRequestNumber(trimmed);
  const searchText = number ? String(number) : sanitizePullRequestSearchText(trimmed);
  const searched = searchText
    ? await searchPullRequests(ctx, `is:pr repo:${owner}/${repo} ${searchText}`)
    : [];

  const mapped = searched
    .filter((item) => item.owner === owner && item.repo === repo)
    .map(mapSearchedPullRequest);

  if (number) {
    try {
      const pr = await getPullRequest(ctx, owner, repo, number);
      return [pr, ...mapped.filter((item) => item.number !== number)];
    } catch {
      // Direct lookup failed; return whatever search found.
    }
  }

  return mapped;
}

export async function getPullRequest(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubPullRequest> {
  const pr = await request<RawPullRequest>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
  );

  return mapPullRequest(pr);
}

export async function getOpenPullRequestForBranch(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  branch: string,
): Promise<GitHubPullRequest | null> {
  const cacheKey = `${owner}/${repo}/${branch}:open`;
  const cached = ctx.prByBranchCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PR_BY_BRANCH_CACHE_TTL_MS) {
    return cached.pr;
  }

  const data = await request<RawPullRequest[]>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`,
  );

  const pr = data.length > 0 ? mapPullRequest(data[0]) : null;
  ctx.prByBranchCache.set(cacheKey, { pr, fetchedAt: Date.now() });
  return pr;
}

export async function getBranchHeadSha(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  branch: string,
): Promise<string | null> {
  const branches = await listBranches(ctx, owner, repo);
  const match = branches.find((item) => item.name === branch);
  return match?.sha ?? null;
}

export async function getPullRequestForBranch(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  branch: string,
): Promise<GitHubPullRequest | null> {
  const cacheKey = `${owner}/${repo}/${branch}`;
  const cached = ctx.prByBranchCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PR_BY_BRANCH_CACHE_TTL_MS) {
    return cached.pr;
  }

  const data = await request<RawPullRequest[]>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=all`,
  );

  const pr = data.length > 0 ? mapPullRequest(data[0]) : null;
  ctx.prByBranchCache.set(cacheKey, { pr, fetchedAt: Date.now() });
  return pr;
}

/**
 * Full PR payload for the detail page.
 *
 * `mergeable`/`mergeable_state` only exist on this single-PR endpoint, and
 * GitHub computes them asynchronously: right after a push they come back
 * `null`/`unknown`. Retry a couple of times while the PR is still open, then
 * report `unknown` honestly and let the client poll.
 */
export async function getPullRequestDetail(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestDetail> {
  const url = prUrl(owner, repo, prNumber);
  const [settings, first] = await Promise.all([
    getRepoSettings(ctx, owner, repo),
    request<RawPullRequestDetail>(ctx, url),
  ]);

  let pr = first;
  const delay = ctx.options.mergeabilityRetryDelayMs ?? DEFAULT_MERGEABILITY_RETRY_DELAY_MS;
  for (let attempt = 0; attempt < MERGEABILITY_RETRIES && isMergeabilityPending(pr); attempt++) {
    await sleep(delay);
    pr = await request<RawPullRequestDetail>(ctx, url);
  }

  return mapPullRequestDetail(owner, repo, pr, settings);
}

/**
 * Combined status for a commit: modern check runs plus legacy commit statuses.
 *
 * Both are needed — repos on classic CI report only statuses and would
 * otherwise look like they have no checks at all. Callers must pass the PR
 * head sha; while a PR is open `merge_commit_sha` is GitHub's throwaway test
 * merge commit and carries no checks.
 */
export async function getPullRequestChecks(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  headSha: string,
): Promise<PullRequestChecks> {
  assertPathSegment(owner, 'owner');
  assertPathSegment(repo, 'repo');
  assertPathSegment(headSha, 'sha');
  const base = `https://api.github.com/repos/${owner}/${repo}/commits/${headSha}`;

  const runs: PullRequestCheck[] = [];
  let totalCount = 0;

  for (let page = 1; page <= MAX_CHECK_RUN_PAGES; page++) {
    const data = await request<{ total_count: number; check_runs: RawCheckRun[] }>(
      ctx,
      `${base}/check-runs?per_page=100&page=${page}`,
    );
    totalCount = data.total_count;
    runs.push(...data.check_runs.map(mapCheckRun));
    if (data.check_runs.length === 0 || runs.length >= totalCount) break;
  }

  const combined = await request<{ statuses: RawCommitStatus[] }>(ctx, `${base}/status`);
  const checks = [...runs, ...(combined.statuses ?? []).map(mapCommitStatus)];

  return {
    headSha,
    rollup: rollupChecks(checks),
    total: checks.length,
    passing: checks.filter((check) => check.conclusion === 'success').length,
    failing: checks.filter((check) => check.conclusion && FAILING_CONCLUSIONS.has(check.conclusion)).length,
    pending: checks.filter((check) => check.status !== 'completed').length,
    neutral: checks.filter(
      (check) =>
        check.status === 'completed' &&
        check.conclusion !== 'success' &&
        !(check.conclusion && FAILING_CONCLUSIONS.has(check.conclusion)),
    ).length,
    truncated: runs.length < totalCount,
    checks,
  };
}

/** Inline review comments on the PR diff (includes thread replies). */
export async function listPullRequestReviewComments(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestReviewComment[]> {
  const data = await request<RawReviewComment[]>(
    ctx,
    `${prUrl(owner, repo, prNumber)}/comments?per_page=100`,
  );
  return data.map((comment) => ({
    id: String(comment.id),
    author: mapUser(comment.user),
    body: comment.body ?? '',
    path: comment.path ?? null,
    line: comment.line ?? comment.original_line ?? null,
    htmlUrl: comment.html_url ?? null,
    createdAt: comment.created_at,
    inReplyToId: comment.in_reply_to_id != null ? String(comment.in_reply_to_id) : null,
    pullRequestReviewId:
      comment.pull_request_review_id != null ? String(comment.pull_request_review_id) : null,
  }));
}

export async function listPullRequestReviews(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestReview[]> {
  const data = await request<RawReview[]>(
    ctx,
    `${prUrl(owner, repo, prNumber)}/reviews?per_page=100`,
  );
  return data.map((review) => ({
    id: String(review.id),
    author: mapUser(review.user),
    state: review.state,
    body: review.body ?? '',
    htmlUrl: review.html_url ?? null,
    submittedAt: review.submitted_at ?? null,
  }));
}

/** GitHub caps this endpoint at 300 files and omits `patch` for binary/oversized files. */
export async function listPullRequestFiles(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestFiles> {
  const data = await request<RawFile[]>(
    ctx,
    `${prUrl(owner, repo, prNumber)}/files?per_page=100`,
  );
  return {
    truncated: data.length >= 300,
    files: data.map((file) => ({
      filename: file.filename,
      previousFilename: file.previous_filename ?? null,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch ?? null,
      blobUrl: file.blob_url ?? null,
    })),
  };
}

export async function listPullRequestCommits(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestCommit[]> {
  const data = await request<RawCommit[]>(
    ctx,
    `${prUrl(owner, repo, prNumber)}/commits?per_page=100`,
  );
  return data.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    authorName: commit.commit.author?.name ?? null,
    authorLogin: commit.author?.login ?? null,
    authoredAt: commit.commit.author?.date ?? null,
    htmlUrl: commit.html_url ?? null,
  }));
}

/** PR conversation comments live on the issues endpoint, not the pulls one. */
export async function listPullRequestComments(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestComment[]> {
  assertPathSegment(owner, 'owner');
  assertPathSegment(repo, 'repo');
  const data = await request<RawComment[]>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
  );
  return data.map((comment) => ({
    id: String(comment.id),
    author: mapUser(comment.user),
    body: comment.body ?? '',
    htmlUrl: comment.html_url ?? null,
    createdAt: comment.created_at,
  }));
}
