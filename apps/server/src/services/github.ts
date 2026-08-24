import type { GitHubBranch, GitHubPullRequest } from '@agent-orchestrator/shared';

interface GitHubApiOptions {
  token?: string;
}

export class GitHubService {
  constructor(private options: GitHubApiOptions) {}

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
