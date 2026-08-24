import type { GitHubBranch, GitHubPullRequest, GitHubRepository } from '@agent-orchestrator/shared';

interface GitHubApiOptions {
  token?: string;
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

  private requireToken(): string {
    if (!this.options.token) {
      throw new Error('GitHub token is not configured');
    }
    return this.options.token;
  }

  private async request<T>(url: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agent-orchestrator',
    };

    if (this.options.token) {
      headers.Authorization = `Bearer ${this.options.token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${body}`);
    }
    return response.json() as Promise<T>;
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
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('403') || message.includes('401')) {
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
    const data = await this.request<
      Array<{
        number: number;
        title: string;
        state: string;
        draft: boolean;
        html_url: string;
        head: { ref: string };
        base: { ref: string };
      }>
    >(`https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=100`);

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      htmlUrl: pr.html_url,
      draft: pr.draft,
    }));
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    const pr = await this.request<{
      number: number;
      title: string;
      state: string;
      draft: boolean;
      html_url: string;
      head: { ref: string };
      base: { ref: string };
    }>(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`);

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      htmlUrl: pr.html_url,
      draft: pr.draft,
    };
  }

  async searchRepositories(query: string): Promise<GitHubRepository[]> {
    if (!this.options.token) {
      throw new Error('GitHub token is not configured');
    }

    const trimmed = query.trim();
    let url: string;

    if (trimmed) {
      const searchQuery = encodeURIComponent(`${trimmed} in:name fork:true`);
      url = `https://api.github.com/search/repositories?q=${searchQuery}&sort=updated&per_page=30`;
    } else {
      url =
        'https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=30';
    }

    if (trimmed) {
      const data = await this.request<{
        items: Array<{
          owner: { login: string };
          name: string;
          full_name: string;
          html_url: string;
          description: string | null;
          private: boolean;
        }>;
      }>(url);
      return data.items.map(mapRepository);
    }

    const data = await this.request<
      Array<{
        owner: { login: string };
        name: string;
        full_name: string;
        html_url: string;
        description: string | null;
        private: boolean;
      }>
    >(url);
    return data.map(mapRepository);
  }

  async createPullRequest(
    owner: string,
    repo: string,
    options: { title: string; body?: string; head: string; base: string },
  ): Promise<{ number: number; htmlUrl: string }> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agent-orchestrator',
      'Content-Type': 'application/json',
    };

    if (this.options.token) {
      headers.Authorization = `Bearer ${this.options.token}`;
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: options.title,
        body: options.body ?? '',
        head: options.head,
        base: options.base,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to create PR: ${response.status} ${body}`);
    }

    const data = (await response.json()) as { number: number; html_url: string };
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
