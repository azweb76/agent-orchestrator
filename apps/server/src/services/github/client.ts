import type { GitHubPullRequest, GitHubRepository } from '@agent-orchestrator/shared';
import { PATH_SEGMENT_PATTERN } from './constants.js';
import { GitHubApiError } from './errors.js';
import type { RawRepoSettings } from './raw-types.js';

export interface GitHubApiOptions {
  token?: string;
  /**
   * Delay between retries while GitHub computes `mergeable` in the background.
   * Tests pass 0 so they do not need fake timers.
   */
  mergeabilityRetryDelayMs?: number;
}

export interface GitHubClientContext {
  options: GitHubApiOptions;
  loginCache: string | null | undefined;
  repoCache: { repos: GitHubRepository[]; fetchedAt: number } | null;
  prByBranchCache: Map<string, { pr: GitHubPullRequest | null; fetchedAt: number }>;
  /** Per-repo settings (merge methods, delete-on-merge); distinct from the user's repo list. */
  repoDetailCache: Map<string, { settings: RawRepoSettings; fetchedAt: number }>;
}

export function createGitHubClientContext(options: GitHubApiOptions = {}): GitHubClientContext {
  return {
    options,
    loginCache: undefined,
    repoCache: null,
    prByBranchCache: new Map(),
    repoDetailCache: new Map(),
  };
}

export function resetTokenCaches(ctx: GitHubClientContext): void {
  ctx.loginCache = undefined;
  ctx.repoCache = null;
  ctx.prByBranchCache.clear();
  ctx.repoDetailCache.clear();
}

export function requireToken(ctx: GitHubClientContext): string {
  if (!ctx.options.token) {
    throw new Error('GitHub token is not configured');
  }
  return ctx.options.token;
}

/** Prefer GitHub's own error text; fall back to the raw body. */
export function errorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed?.message) return parsed.message;
  } catch {
    // Non-JSON error body (HTML error page, empty response).
  }
  return `GitHub API error ${status}: ${body}`;
}

export async function request<T>(
  ctx: GitHubClientContext,
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'agent-orchestrator',
  };

  if (ctx.options.token) {
    headers.Authorization = `Bearer ${ctx.options.token}`;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new GitHubApiError(errorMessage(text, response.status), response.status, url);
  }

  // 202/204 and other write responses may carry no body at all.
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Guard interpolated URL segments (owner/repo/sha) against path traversal. */
export function assertPathSegment(value: string, label: string): string {
  if (value === '.' || value === '..' || !PATH_SEGMENT_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

export function prUrl(owner: string, repo: string, prNumber: number): string {
  assertPathSegment(owner, 'owner');
  assertPathSegment(repo, 'repo');
  return `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
