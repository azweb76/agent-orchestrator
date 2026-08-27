import type {
  GitHubBranch,
  GitHubPullRequest,
  GitHubRepository,
  MergePullRequestRequest,
  MergePullRequestResponse,
  PullRequestCheck,
  PullRequestChecks,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetail,
  PullRequestFiles,
  PullRequestMergeMethod,
  PullRequestMergeableState,
  PullRequestReview,
  PullRequestReviewComment,
  PullRequestUser,
  UpdatePullRequestBranchResponse,
} from '@agent-orchestrator/shared';
import { parsePullRequestNumber, rollupChecks } from '@agent-orchestrator/shared';

interface GitHubApiOptions {
  token?: string;
  /**
   * Delay between retries while GitHub computes `mergeable` in the background.
   * Tests pass 0 so they do not need fake timers.
   */
  mergeabilityRetryDelayMs?: number;
}

const REPO_CACHE_TTL_MS = 5 * 60 * 1000;
const PR_BY_BRANCH_CACHE_TTL_MS = 60 * 1000;
/** GitHub only allows path segments matching this in owner/repo/sha positions. */
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
/** `/commits/{sha}/check-runs` pages at 100; cap the fan-out for huge suites. */
const MAX_CHECK_RUN_PAGES = 3;
const MERGEABILITY_RETRIES = 2;
const DEFAULT_MERGEABILITY_RETRY_DELAY_MS = 800;
/** Conclusions that make a suite red. */
const FAILING_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);

/** GitHub REST error with the status preserved so routes can map it faithfully. */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

interface RawPullRequest {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  user?: { login: string } | null;
  updated_at?: string;
}

function mapPullRequest(pr: RawPullRequest): GitHubPullRequest {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    htmlUrl: pr.html_url,
    draft: pr.draft,
    authorLogin: pr.user?.login ?? '',
    updatedAt: pr.updated_at ?? '',
  };
}

function mapSearchedPullRequest(item: SearchedPullRequest): GitHubPullRequest {
  return {
    number: item.number,
    title: item.title,
    state: item.state,
    headRef: '',
    baseRef: '',
    htmlUrl: item.htmlUrl,
    draft: item.draft,
    authorLogin: item.authorLogin,
    updatedAt: item.updatedAt,
  };
}

/** Strip characters that would change GitHub search operators (`repo:`, quotes). */
function sanitizePullRequestSearchText(query: string): string {
  return query.replace(/[:"']/g, ' ').replace(/\s+/g, ' ').trim();
}

interface GitHubSearchIssue {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  html_url: string;
  updated_at: string;
  user: { login: string };
  repository_url: string;
  pull_request?: { url: string };
}

export interface SearchedPullRequest {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  draft: boolean;
  owner: string;
  repo: string;
  authorLogin: string;
  updatedAt: string;
}

export class GitHubService {
  constructor(private options: GitHubApiOptions) {}

  private loginCache: string | null | undefined;
  private repoCache: { repos: GitHubRepository[]; fetchedAt: number } | null = null;
  private prByBranchCache = new Map<string, { pr: GitHubPullRequest | null; fetchedAt: number }>();
  /** Per-repo settings (merge methods, delete-on-merge); distinct from the user's repo list. */
  private repoDetailCache = new Map<string, { settings: RawRepoSettings; fetchedAt: number }>();

  private requireToken(): string {
    if (!this.options.token) {
      throw new Error('GitHub token is not configured');
    }
    return this.options.token;
  }

  private async request<T>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agent-orchestrator',
    };

    if (this.options.token) {
      headers.Authorization = `Bearer ${this.options.token}`;
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
  private assertPathSegment(value: string, label: string): string {
    if (value === '.' || value === '..' || !PATH_SEGMENT_PATTERN.test(value)) {
      throw new Error(`Invalid ${label}: ${value}`);
    }
    return value;
  }

  private prUrl(owner: string, repo: string, prNumber: number): string {
    this.assertPathSegment(owner, 'owner');
    this.assertPathSegment(repo, 'repo');
    return `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  }

  /** Resolve the authenticated GitHub login for search queries (user PAT required). */
  async getAuthenticatedLogin(): Promise<string> {
    if (process.env.GITHUB_LOGIN?.trim()) {
      return process.env.GITHUB_LOGIN.trim();
    }

    if (this.loginCache !== undefined) {
      if (!this.loginCache) {
        throw new Error(
          'GITHUB_TOKEN must be a personal access token for a user account (not a GitHub App installation token). Optionally set GITHUB_LOGIN.',
        );
      }
      return this.loginCache;
    }

    this.requireToken();
    try {
      const user = await this.request<{ login: string }>('https://api.github.com/user');
      this.loginCache = user.login;
      return user.login;
    } catch (error) {
      this.loginCache = null;
      const status = error instanceof GitHubApiError ? error.status : 0;
      if (status === 401 || status === 403) {
        throw new Error(
          'GITHUB_TOKEN must be a personal access token for a user account (not a GitHub App installation token). Optionally set GITHUB_LOGIN.',
        );
      }
      throw error;
    }
  }

  private async searchPullRequests(query: string): Promise<SearchedPullRequest[]> {
    this.requireToken();
    const encoded = encodeURIComponent(query);
    const data = await this.request<{ items: GitHubSearchIssue[] }>(
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

  async listAuthoredOpenPullRequests(): Promise<SearchedPullRequest[]> {
    const login = await this.getAuthenticatedLogin();
    return this.searchPullRequests(`is:pr is:open author:${login}`);
  }

  async listReviewRequestedPullRequests(): Promise<SearchedPullRequest[]> {
    const login = await this.getAuthenticatedLogin();
    return this.searchPullRequests(`is:pr is:open review-requested:${login}`);
  }

  async listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    const data = await this.request<Array<{ name: string; commit: { sha: string }; protected: boolean }>>(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
    );
    return data.map((branch) => ({
      name: branch.name,
      sha: branch.commit.sha,
      protected: branch.protected,
    }));
  }

  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubPullRequest[]> {
    const data = await this.request<RawPullRequest[]>(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=100`,
    );

    return data.map(mapPullRequest);
  }

  /**
   * Search pull requests in a repo (open and closed). Empty query lists open PRs.
   * A bare number / `#N` / GitHub URL also tries the direct PR endpoint so private
   * PRs that search misses still resolve.
   */
  async searchRepositoryPullRequests(owner: string, repo: string, query: string): Promise<GitHubPullRequest[]> {
    this.assertPathSegment(owner, 'owner');
    this.assertPathSegment(repo, 'repo');

    const trimmed = query.trim();
    if (!trimmed) {
      return this.listPullRequests(owner, repo);
    }

    const number = parsePullRequestNumber(trimmed);
    const searchText = number ? String(number) : sanitizePullRequestSearchText(trimmed);
    const searched = searchText
      ? await this.searchPullRequests(`is:pr repo:${owner}/${repo} ${searchText}`)
      : [];

    const mapped = searched
      .filter((item) => item.owner === owner && item.repo === repo)
      .map(mapSearchedPullRequest);

    if (number) {
      try {
        const pr = await this.getPullRequest(owner, repo, number);
        return [pr, ...mapped.filter((item) => item.number !== number)];
      } catch {
        // Direct lookup failed; return whatever search found.
      }
    }

    return mapped;
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    const pr = await this.request<RawPullRequest>(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    );

    return mapPullRequest(pr);
  }

  async getOpenPullRequestForBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubPullRequest | null> {
    const cacheKey = `${owner}/${repo}/${branch}:open`;
    const cached = this.prByBranchCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PR_BY_BRANCH_CACHE_TTL_MS) {
      return cached.pr;
    }

    const data = await this.request<RawPullRequest[]>(
      `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`,
    );

    const pr = data.length > 0 ? mapPullRequest(data[0]) : null;
    this.prByBranchCache.set(cacheKey, { pr, fetchedAt: Date.now() });
    return pr;
  }

  async getBranchHeadSha(owner: string, repo: string, branch: string): Promise<string | null> {
    const branches = await this.listBranches(owner, repo);
    const match = branches.find((item) => item.name === branch);
    return match?.sha ?? null;
  }

  async getPullRequestForBranch(owner: string, repo: string, branch: string): Promise<GitHubPullRequest | null> {
    const cacheKey = `${owner}/${repo}/${branch}`;
    const cached = this.prByBranchCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PR_BY_BRANCH_CACHE_TTL_MS) {
      return cached.pr;
    }

    const data = await this.request<RawPullRequest[]>(
      `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=all`,
    );

    const pr = data.length > 0 ? mapPullRequest(data[0]) : null;
    this.prByBranchCache.set(cacheKey, { pr, fetchedAt: Date.now() });
    return pr;
  }

  private async getAllAccessibleRepos(): Promise<GitHubRepository[]> {
    if (this.repoCache && Date.now() - this.repoCache.fetchedAt < REPO_CACHE_TTL_MS) {
      return this.repoCache.repos;
    }

    const repos: GitHubRepository[] = [];
    const maxPages = 5;

    for (let page = 1; page <= maxPages; page++) {
      const data = await this.request<
        Array<{
          owner: { login: string };
          name: string;
          full_name: string;
          html_url: string;
          description: string | null;
          private: boolean;
        }>
      >(
        `https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100&page=${page}`,
      );

      repos.push(...data.map(mapRepository));

      if (data.length < 100) {
        break;
      }
    }

    this.repoCache = { repos, fetchedAt: Date.now() };
    return repos;
  }

  async searchRepositories(query: string): Promise<GitHubRepository[]> {
    if (!this.options.token) {
      throw new Error('GitHub token is not configured');
    }

    const allRepos = await this.getAllAccessibleRepos();

    const trimmed = query.trim();
    if (!trimmed) {
      return allRepos.slice(0, 30);
    }

    const normalized = trimmed.toLowerCase();
    const matches = allRepos.filter((repo) => `${repo.owner}/${repo.name}`.toLowerCase().includes(normalized));

    const isPrefixMatch = (repo: GitHubRepository) => {
      const combined = `${repo.owner}/${repo.name}`.toLowerCase();
      return combined.startsWith(normalized) || repo.name.toLowerCase().startsWith(normalized);
    };

    const prefixMatches = matches.filter(isPrefixMatch);
    const substringMatches = matches.filter((repo) => !isPrefixMatch(repo));

    return [...prefixMatches, ...substringMatches].slice(0, 30);
  }

  /** Repo settings drive which merge buttons the UI may offer. */
  private async getRepoSettings(owner: string, repo: string): Promise<RawRepoSettings> {
    const cacheKey = `${owner}/${repo}`;
    const cached = this.repoDetailCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < REPO_CACHE_TTL_MS) {
      return cached.settings;
    }

    const settings = await this.request<RawRepoSettings>(
      `https://api.github.com/repos/${owner}/${repo}`,
    );
    this.repoDetailCache.set(cacheKey, { settings, fetchedAt: Date.now() });
    return settings;
  }

  /**
   * Full PR payload for the detail page.
   *
   * `mergeable`/`mergeable_state` only exist on this single-PR endpoint, and
   * GitHub computes them asynchronously: right after a push they come back
   * `null`/`unknown`. Retry a couple of times while the PR is still open, then
   * report `unknown` honestly and let the client poll.
   */
  async getPullRequestDetail(owner: string, repo: string, prNumber: number): Promise<PullRequestDetail> {
    const url = this.prUrl(owner, repo, prNumber);
    const [settings, first] = await Promise.all([
      this.getRepoSettings(owner, repo),
      this.request<RawPullRequestDetail>(url),
    ]);

    let pr = first;
    const delay = this.options.mergeabilityRetryDelayMs ?? DEFAULT_MERGEABILITY_RETRY_DELAY_MS;
    for (let attempt = 0; attempt < MERGEABILITY_RETRIES && isMergeabilityPending(pr); attempt++) {
      await sleep(delay);
      pr = await this.request<RawPullRequestDetail>(url);
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
  async getPullRequestChecks(owner: string, repo: string, headSha: string): Promise<PullRequestChecks> {
    this.assertPathSegment(owner, 'owner');
    this.assertPathSegment(repo, 'repo');
    this.assertPathSegment(headSha, 'sha');
    const base = `https://api.github.com/repos/${owner}/${repo}/commits/${headSha}`;

    const runs: PullRequestCheck[] = [];
    let totalCount = 0;

    for (let page = 1; page <= MAX_CHECK_RUN_PAGES; page++) {
      const data = await this.request<{ total_count: number; check_runs: RawCheckRun[] }>(
        `${base}/check-runs?per_page=100&page=${page}`,
      );
      totalCount = data.total_count;
      runs.push(...data.check_runs.map(mapCheckRun));
      if (data.check_runs.length === 0 || runs.length >= totalCount) break;
    }

    const combined = await this.request<{ statuses: RawCommitStatus[] }>(`${base}/status`);
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
  async listPullRequestReviewComments(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestReviewComment[]> {
    const data = await this.request<RawReviewComment[]>(
      `${this.prUrl(owner, repo, prNumber)}/comments?per_page=100`,
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

  async listPullRequestReviews(owner: string, repo: string, prNumber: number): Promise<PullRequestReview[]> {
    const data = await this.request<RawReview[]>(
      `${this.prUrl(owner, repo, prNumber)}/reviews?per_page=100`,
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
  async listPullRequestFiles(owner: string, repo: string, prNumber: number): Promise<PullRequestFiles> {
    const data = await this.request<RawFile[]>(
      `${this.prUrl(owner, repo, prNumber)}/files?per_page=100`,
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

  async listPullRequestCommits(owner: string, repo: string, prNumber: number): Promise<PullRequestCommit[]> {
    const data = await this.request<RawCommit[]>(
      `${this.prUrl(owner, repo, prNumber)}/commits?per_page=100`,
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
  async listPullRequestComments(owner: string, repo: string, prNumber: number): Promise<PullRequestComment[]> {
    this.assertPathSegment(owner, 'owner');
    this.assertPathSegment(repo, 'repo');
    const data = await this.request<RawComment[]>(
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

  async createPullRequestReview(
    owner: string,
    repo: string,
    prNumber: number,
    body: { event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body?: string },
  ): Promise<PullRequestReview> {
    const data = await this.request<RawReview>(`${this.prUrl(owner, repo, prNumber)}/reviews`, {
      method: 'POST',
      body: {
        event: body.event,
        ...(body.body?.trim() ? { body: body.body.trim() } : {}),
      },
    });
    this.invalidatePullRequestCaches(owner, repo);
    return {
      id: String(data.id),
      author: mapUser(data.user),
      state: data.state,
      body: data.body ?? '',
      htmlUrl: data.html_url ?? null,
      submittedAt: data.submitted_at ?? null,
    };
  }

  async createPullRequestComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
  ): Promise<PullRequestComment> {
    this.assertPathSegment(owner, 'owner');
    this.assertPathSegment(repo, 'repo');
    const data = await this.request<RawComment>(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      { method: 'POST', body: { body } },
    );
    this.invalidatePullRequestCaches(owner, repo);
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
  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    body: MergePullRequestRequest,
  ): Promise<MergePullRequestResponse> {
    const result = await this.request<{ merged?: boolean; message?: string; sha?: string }>(
      `${this.prUrl(owner, repo, prNumber)}/merge`,
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

    this.invalidatePullRequestCaches(owner, repo);
    return {
      merged: Boolean(result?.merged),
      message: result?.message ?? 'Pull request merged.',
      sha: result?.sha ?? null,
    };
  }

  async setPullRequestState(
    owner: string,
    repo: string,
    prNumber: number,
    state: 'open' | 'closed',
  ): Promise<PullRequestDetail> {
    const url = this.prUrl(owner, repo, prNumber);
    const [settings, pr] = await Promise.all([
      this.getRepoSettings(owner, repo),
      this.request<RawPullRequestDetail>(url, { method: 'PATCH', body: { state } }),
    ]);

    this.invalidatePullRequestCaches(owner, repo);
    return mapPullRequestDetail(owner, repo, pr, settings);
  }

  /**
   * Merge (or rebase, per repo settings) the base branch into the head branch.
   * The 202 only means "queued" — the head sha changes a moment later. A 422
   * means the branch is not behind, or the expected sha no longer matches.
   */
  async updatePullRequestBranch(
    owner: string,
    repo: string,
    prNumber: number,
    expectedHeadSha?: string,
  ): Promise<UpdatePullRequestBranchResponse> {
    const result = await this.request<{ message?: string } | undefined>(
      `${this.prUrl(owner, repo, prNumber)}/update-branch`,
      {
        method: 'PUT',
        body: expectedHeadSha ? { expected_head_sha: expectedHeadSha } : {},
      },
    );

    this.invalidatePullRequestCaches(owner, repo);
    return { queued: true, message: result?.message ?? 'Updating pull request branch.' };
  }

  /**
   * Drop cached branch→PR lookups for a repo after a write, so agent pages do
   * not report stale PR state for the rest of the TTL.
   */
  invalidatePullRequestCaches(owner: string, repo: string): void {
    const prefix = `${owner}/${repo}/`;
    for (const key of this.prByBranchCache.keys()) {
      if (key.startsWith(prefix)) {
        this.prByBranchCache.delete(key);
      }
    }
  }

  async createPullRequest(
    owner: string,
    repo: string,
    options: { title: string; body?: string; head: string; base: string },
  ): Promise<{ number: number; htmlUrl: string }> {
    this.assertPathSegment(owner, 'owner');
    this.assertPathSegment(repo, 'repo');

    const data = await this.request<{ number: number; html_url: string }>(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        body: {
          title: options.title,
          body: options.body ?? '',
          head: options.head,
          base: options.base,
        },
      },
    );

    return { number: data.number, htmlUrl: data.html_url };
  }
}

function mapRepository(repo: {
  owner: { login: string };
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
}): GitHubRepository {
  return {
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    description: repo.description,
    private: repo.private,
  };
}

interface RawUser {
  login: string;
  avatar_url?: string | null;
  html_url?: string | null;
}

interface RawPullRequestDetail {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  rebaseable: boolean | null;
  html_url: string;
  user: RawUser | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  commits?: number;
  comments?: number;
  review_comments?: number;
  labels?: Array<{ name: string; color?: string | null }>;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  merge_commit_sha: string | null;
}

interface RawRepoSettings {
  allow_merge_commit?: boolean;
  allow_squash_merge?: boolean;
  allow_rebase_merge?: boolean;
  delete_branch_on_merge?: boolean;
}

interface RawCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  output?: { title?: string | null; summary?: string | null };
  details_url?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface RawCommitStatus {
  id: number;
  context: string;
  state: string;
  description: string | null;
  target_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface RawReview {
  id: number;
  user: RawUser | null;
  state: string;
  body: string | null;
  html_url?: string | null;
  submitted_at?: string | null;
}

interface RawFile {
  filename: string;
  previous_filename?: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string | null;
  blob_url?: string | null;
}

interface RawCommit {
  sha: string;
  html_url?: string | null;
  author: RawUser | null;
  commit: { message: string; author?: { name?: string | null; date?: string | null } | null };
}

interface RawComment {
  id: number;
  user: RawUser | null;
  body: string | null;
  html_url?: string | null;
  created_at: string;
}

interface RawReviewComment {
  id: number;
  user: RawUser | null;
  body: string | null;
  path?: string | null;
  line?: number | null;
  original_line?: number | null;
  html_url?: string | null;
  created_at: string;
  in_reply_to_id?: number | null;
  pull_request_review_id?: number | null;
}

/** Prefer GitHub's own error text; fall back to the raw body. */
function errorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed?.message) return parsed.message;
  } catch {
    // Non-JSON error body (HTML error page, empty response).
  }
  return `GitHub API error ${status}: ${body}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True while GitHub has not finished computing mergeability for an open PR. */
function isMergeabilityPending(pr: RawPullRequestDetail): boolean {
  if (pr.state !== 'open' || pr.merged) return false;
  return pr.mergeable === null || pr.mergeable_state === 'unknown';
}

function mapUser(user: RawUser | null | undefined): PullRequestUser | null {
  if (!user) return null;
  return {
    login: user.login,
    avatarUrl: user.avatar_url ?? null,
    htmlUrl: user.html_url ?? null,
  };
}

function mergeMethodsFor(settings: RawRepoSettings): PullRequestMergeMethod[] {
  const methods: PullRequestMergeMethod[] = [];
  if (settings.allow_merge_commit !== false) methods.push('merge');
  if (settings.allow_squash_merge !== false) methods.push('squash');
  if (settings.allow_rebase_merge !== false) methods.push('rebase');
  return methods;
}

function mapPullRequestDetail(
  owner: string,
  repo: string,
  pr: RawPullRequestDetail,
  settings: RawRepoSettings,
): PullRequestDetail {
  return {
    owner,
    repo,
    number: pr.number,
    title: pr.title,
    body: pr.body ?? '',
    state: pr.state,
    draft: Boolean(pr.draft),
    merged: Boolean(pr.merged),
    mergeable: pr.mergeable ?? null,
    mergeableState: (pr.mergeable_state ?? 'unknown') as PullRequestMergeableState,
    rebaseable: pr.rebaseable ?? null,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    htmlUrl: pr.html_url,
    author: mapUser(pr.user),
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changed_files ?? 0,
    commitCount: pr.commits ?? 0,
    commentCount: pr.comments ?? 0,
    reviewCommentCount: pr.review_comments ?? 0,
    labels: (pr.labels ?? []).map((label) => ({ name: label.name, color: label.color ?? null })),
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
    mergeCommitSha: pr.merge_commit_sha,
    allowedMergeMethods: mergeMethodsFor(settings),
    deleteBranchOnMerge: Boolean(settings.delete_branch_on_merge),
    workspaceId: null,
    agentId: null,
  };
}

function mapCheckRun(run: RawCheckRun): PullRequestCheck {
  return {
    id: `check_run:${run.id}`,
    name: run.name,
    source: 'check_run',
    status: (run.status === 'queued' || run.status === 'in_progress' ? run.status : 'completed'),
    conclusion: run.conclusion ?? null,
    summary: run.output?.title ?? run.output?.summary ?? null,
    detailsUrl: run.details_url ?? null,
    startedAt: run.started_at ?? null,
    completedAt: run.completed_at ?? null,
  };
}

/** Normalize a legacy commit status into the check-run shape. */
function mapCommitStatus(status: RawCommitStatus): PullRequestCheck {
  const pending = status.state === 'pending';
  return {
    id: `status:${status.id}`,
    name: status.context,
    source: 'status',
    status: pending ? 'in_progress' : 'completed',
    conclusion: pending ? null : status.state === 'success' ? 'success' : 'failure',
    summary: status.description ?? null,
    detailsUrl: status.target_url ?? null,
    startedAt: status.created_at ?? null,
    completedAt: pending ? null : (status.updated_at ?? null),
  };
}
