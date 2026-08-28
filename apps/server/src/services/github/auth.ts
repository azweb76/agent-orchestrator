import { GitHubApiError } from './errors.js';
import type { GitHubSearchIssue, SearchedPullRequest } from './raw-types.js';
import type { GitHubClientContext } from './client.js';
import { request, requireToken } from './client.js';

/** Resolve the authenticated GitHub login for search queries (user PAT required). */
export async function getAuthenticatedLogin(ctx: GitHubClientContext): Promise<string> {
  if (process.env.GITHUB_LOGIN?.trim()) {
    return process.env.GITHUB_LOGIN.trim();
  }

  if (ctx.loginCache !== undefined) {
    if (!ctx.loginCache) {
      throw new Error(
        'GITHUB_TOKEN must be a personal access token for a user account (not a GitHub App installation token). Optionally set GITHUB_LOGIN.',
      );
    }
    return ctx.loginCache;
  }

  requireToken(ctx);
  try {
    const user = await request<{ login: string }>(ctx, 'https://api.github.com/user');
    ctx.loginCache = user.login;
    return user.login;
  } catch (error) {
    ctx.loginCache = null;
    const status = error instanceof GitHubApiError ? error.status : 0;
    if (status === 401 || status === 403) {
      throw new Error(
        'GITHUB_TOKEN must be a personal access token for a user account (not a GitHub App installation token). Optionally set GITHUB_LOGIN.',
        { cause: error },
      );
    }
    throw error;
  }
}

export async function searchPullRequests(
  ctx: GitHubClientContext,
  query: string,
): Promise<SearchedPullRequest[]> {
  requireToken(ctx);
  const encoded = encodeURIComponent(query);
  const data = await request<{ items: GitHubSearchIssue[] }>(
    ctx,
    `https://api.github.com/search/issues?q=${encoded}&sort=updated&order=desc&per_page=50`,
  );

  return data.items
    .filter((item) => Boolean(item.pull_request))
    .map((item) => {
      const match = item.repository_url.match(/repos\/([^/]+)\/([^/]+)$/);
      const owner = match?.[1] ?? '';
      const repo = match?.[2] ?? '';
      return {
        number: item.number,
        title: item.title,
        state: item.state,
        htmlUrl: item.html_url,
        draft: Boolean(item.draft),
        owner,
        repo,
        authorLogin: item.user.login,
        updatedAt: item.updated_at,
      };
    });
}

export async function listAuthoredOpenPullRequests(
  ctx: GitHubClientContext,
): Promise<SearchedPullRequest[]> {
  const login = await getAuthenticatedLogin(ctx);
  return searchPullRequests(ctx, `is:pr is:open author:${login}`);
}

export async function listReviewRequestedPullRequests(
  ctx: GitHubClientContext,
): Promise<SearchedPullRequest[]> {
  const login = await getAuthenticatedLogin(ctx);
  return searchPullRequests(ctx, `is:pr is:open review-requested:${login}`);
}
