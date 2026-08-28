import type {
  Agent,
  CreateAgentFromIssueRequest,
  CreateAgentFromPrRequest,
  CreatePullRequestCommentRequest,
  GitHubRepository,
  IssueInbox,
  MergePullRequestRequest,
  MergePullRequestResponse,
  PullRequestChecks,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetail,
  PullRequestFiles,
  PullRequestInbox,
  PullRequestReview,
  SubmitPullRequestReviewRequest,
  UpdatePullRequestBranchRequest,
  UpdatePullRequestBranchResponse,
  Worktree,
  Workspace,
} from '@agent-orchestrator/shared';
import { request } from './request';

const prBase = (owner: string, repo: string, prNumber: number) =>
  `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`;

export const apiGitHub = {
  searchRepositories: (query: string) =>
    request<GitHubRepository[]>(`/github/repos/search?q=${encodeURIComponent(query)}`),
  getPullRequestInbox: () => request<PullRequestInbox>('/github/pulls/inbox'),
  getIssueInbox: () => request<IssueInbox>('/github/issues/inbox'),
  createAgentFromPr: (body: CreateAgentFromPrRequest) =>
    request<{
      workspace: Workspace;
      worktree: Worktree;
      agent: Agent;
      created: boolean;
      reused: boolean;
      sessionId: string | null;
    }>('/github/pulls/create-agent', { method: 'POST', body: JSON.stringify(body) }),
  createAgentFromIssue: (body: CreateAgentFromIssueRequest) =>
    request<{
      workspace: Workspace;
      worktree: Worktree;
      agent: Agent;
      prompt: string;
      created: boolean;
    }>('/github/issues/create-agent', { method: 'POST', body: JSON.stringify(body) }),
  getPullRequest: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestDetail>(prBase(owner, repo, prNumber)),
  getPullRequestChecks: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestChecks>(`${prBase(owner, repo, prNumber)}/checks`),
  getPullRequestReviews: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestReview[]>(`${prBase(owner, repo, prNumber)}/reviews`),
  getPullRequestFiles: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestFiles>(`${prBase(owner, repo, prNumber)}/files`),
  getPullRequestCommits: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestCommit[]>(`${prBase(owner, repo, prNumber)}/commits`),
  getPullRequestComments: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestComment[]>(`${prBase(owner, repo, prNumber)}/comments`),
  submitPullRequestReview: (
    owner: string,
    repo: string,
    prNumber: number,
    body: SubmitPullRequestReviewRequest,
  ) =>
    request<PullRequestReview>(`${prBase(owner, repo, prNumber)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createPullRequestComment: (
    owner: string,
    repo: string,
    prNumber: number,
    body: CreatePullRequestCommentRequest,
  ) =>
    request<PullRequestComment>(`${prBase(owner, repo, prNumber)}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  mergePullRequest: (
    owner: string,
    repo: string,
    prNumber: number,
    body: MergePullRequestRequest,
  ) =>
    request<MergePullRequestResponse>(`${prBase(owner, repo, prNumber)}/merge`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePullRequestBranch: (
    owner: string,
    repo: string,
    prNumber: number,
    body: UpdatePullRequestBranchRequest,
  ) =>
    request<UpdatePullRequestBranchResponse>(`${prBase(owner, repo, prNumber)}/update-branch`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setPullRequestState: (owner: string, repo: string, prNumber: number, state: 'open' | 'closed') =>
    request<PullRequestDetail>(`${prBase(owner, repo, prNumber)}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ state }),
    }),
  markPullRequestReady: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestDetail>(`${prBase(owner, repo, prNumber)}/ready`, { method: 'POST' }),
  listMergedFleetAgents: () =>
    request<import('@agent-orchestrator/shared').MergedFleetAgent[]>('/fleet/merged-agents'),
};
