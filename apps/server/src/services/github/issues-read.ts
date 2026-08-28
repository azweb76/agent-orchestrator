import type { GitHubIssue, GitHubIssueComment, GitHubIssueDetail } from '@agent-orchestrator/shared';
import { getAuthenticatedLogin, searchIssues } from './auth.js';
import type { GitHubClientContext } from './client.js';
import { assertPathSegment, request } from './client.js';
import type { RawComment } from './raw-types.js';

function mapIssue(issue: {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  user?: { login: string } | null;
  updated_at?: string;
}): GitHubIssue {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    state: issue.state,
    htmlUrl: issue.html_url,
    authorLogin: issue.user?.login ?? '',
    updatedAt: issue.updated_at ?? '',
  };
}

function mapComment(comment: RawComment): GitHubIssueComment {
  return {
    id: String(comment.id),
    authorLogin: comment.user?.login ?? null,
    body: comment.body ?? '',
    createdAt: comment.created_at,
  };
}

export async function getIssue(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GitHubIssue> {
  assertPathSegment(owner, 'owner');
  assertPathSegment(repo, 'repo');
  const issue = await request<{
    number: number;
    title: string;
    body: string | null;
    state: string;
    html_url: string;
    user?: { login: string } | null;
    updated_at?: string;
    pull_request?: { url: string };
  }>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
  );
  if (issue.pull_request) {
    throw new Error(`#${issueNumber} is a pull request, not an issue`);
  }
  return mapIssue(issue);
}

export async function listIssueComments(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GitHubIssueComment[]> {
  assertPathSegment(owner, 'owner');
  assertPathSegment(repo, 'repo');
  const comments = await request<RawComment[]>(
    ctx,
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
  );
  return comments.map(mapComment);
}

export async function getIssueDetail(
  ctx: GitHubClientContext,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GitHubIssueDetail> {
  const [issue, comments] = await Promise.all([
    getIssue(ctx, owner, repo, issueNumber),
    listIssueComments(ctx, owner, repo, issueNumber),
  ]);
  return { ...issue, comments };
}

export async function listAssignedOpenIssues(ctx: GitHubClientContext) {
  const login = await getAuthenticatedLogin(ctx);
  return searchIssues(ctx, `is:issue is:open assignee:${login}`);
}
