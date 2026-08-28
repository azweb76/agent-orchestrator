import type {
  GitHubBranch,
  GitHubIssue,
  GitHubIssueComment,
  GitHubIssueDetail,
  GitHubPullRequest,
  GitHubRepository,
  MergePullRequestRequest,
  MergePullRequestResponse,
  PullRequestChecks,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetail,
  PullRequestFiles,
  PullRequestReview,
  PullRequestReviewComment,
  UpdatePullRequestBranchResponse,
} from '@agent-orchestrator/shared';
import {
  getAuthenticatedLogin,
  listAuthoredOpenPullRequests,
  listReviewRequestedPullRequests,
} from './auth.js';
import type { GitHubApiOptions, GitHubClientContext } from './client.js';
import { createGitHubClientContext, resetTokenCaches } from './client.js';
import {
  getIssue,
  getIssueDetail,
  listAssignedOpenIssues,
  listIssueComments,
} from './issues-read.js';
import {
  getBranchHeadSha,
  getOpenPullRequestForBranch,
  getPullRequest,
  getPullRequestChecks,
  getPullRequestDetail,
  getPullRequestForBranch,
  listBranches,
  listPullRequestComments,
  listPullRequestCommits,
  listPullRequestFiles,
  listPullRequestReviewComments,
  listPullRequestReviews,
  listPullRequests,
  searchRepositoryPullRequests,
} from './pulls-read.js';
import {
  createPullRequest,
  createPullRequestComment,
  createPullRequestReview,
  invalidatePullRequestCaches,
  markPullRequestReadyForReview,
  mergePullRequest,
  setPullRequestState,
  updatePullRequestBranch,
} from './pulls-write.js';
import { searchRepositories } from './repos.js';
import type { SearchedIssue, SearchedPullRequest } from './raw-types.js';

export class GitHubService {
  private ctx: GitHubClientContext;

  constructor(options: GitHubApiOptions) {
    this.ctx = createGitHubClientContext(options);
  }

  setToken(token: string): void {
    this.ctx.options.token = token;
    resetTokenCaches(this.ctx);
  }

  getAuthenticatedLogin(): Promise<string> {
    return getAuthenticatedLogin(this.ctx);
  }

  listAuthoredOpenPullRequests(): Promise<SearchedPullRequest[]> {
    return listAuthoredOpenPullRequests(this.ctx);
  }

  listReviewRequestedPullRequests(): Promise<SearchedPullRequest[]> {
    return listReviewRequestedPullRequests(this.ctx);
  }

  listAssignedOpenIssues(): Promise<SearchedIssue[]> {
    return listAssignedOpenIssues(this.ctx);
  }

  getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    return getIssue(this.ctx, owner, repo, issueNumber);
  }

  listIssueComments(owner: string, repo: string, issueNumber: number): Promise<GitHubIssueComment[]> {
    return listIssueComments(this.ctx, owner, repo, issueNumber);
  }

  getIssueDetail(owner: string, repo: string, issueNumber: number): Promise<GitHubIssueDetail> {
    return getIssueDetail(this.ctx, owner, repo, issueNumber);
  }

  listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    return listBranches(this.ctx, owner, repo);
  }

  listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
  ): Promise<GitHubPullRequest[]> {
    return listPullRequests(this.ctx, owner, repo, state);
  }

  searchRepositoryPullRequests(
    owner: string,
    repo: string,
    query: string,
  ): Promise<GitHubPullRequest[]> {
    return searchRepositoryPullRequests(this.ctx, owner, repo, query);
  }

  getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    return getPullRequest(this.ctx, owner, repo, prNumber);
  }

  getOpenPullRequestForBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubPullRequest | null> {
    return getOpenPullRequestForBranch(this.ctx, owner, repo, branch);
  }

  getBranchHeadSha(owner: string, repo: string, branch: string): Promise<string | null> {
    return getBranchHeadSha(this.ctx, owner, repo, branch);
  }

  getPullRequestForBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubPullRequest | null> {
    return getPullRequestForBranch(this.ctx, owner, repo, branch);
  }

  searchRepositories(query: string): Promise<GitHubRepository[]> {
    return searchRepositories(this.ctx, query);
  }

  getPullRequestDetail(owner: string, repo: string, prNumber: number): Promise<PullRequestDetail> {
    return getPullRequestDetail(this.ctx, owner, repo, prNumber);
  }

  getPullRequestChecks(
    owner: string,
    repo: string,
    headSha: string,
  ): Promise<PullRequestChecks> {
    return getPullRequestChecks(this.ctx, owner, repo, headSha);
  }

  listPullRequestReviewComments(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestReviewComment[]> {
    return listPullRequestReviewComments(this.ctx, owner, repo, prNumber);
  }

  listPullRequestReviews(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestReview[]> {
    return listPullRequestReviews(this.ctx, owner, repo, prNumber);
  }

  listPullRequestFiles(owner: string, repo: string, prNumber: number): Promise<PullRequestFiles> {
    return listPullRequestFiles(this.ctx, owner, repo, prNumber);
  }

  listPullRequestCommits(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestCommit[]> {
    return listPullRequestCommits(this.ctx, owner, repo, prNumber);
  }

  listPullRequestComments(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestComment[]> {
    return listPullRequestComments(this.ctx, owner, repo, prNumber);
  }

  createPullRequestReview(
    owner: string,
    repo: string,
    prNumber: number,
    body: { event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body?: string },
  ): Promise<PullRequestReview> {
    return createPullRequestReview(this.ctx, owner, repo, prNumber, body);
  }

  createPullRequestComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
  ): Promise<PullRequestComment> {
    return createPullRequestComment(this.ctx, owner, repo, prNumber, body);
  }

  mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    body: MergePullRequestRequest,
  ): Promise<MergePullRequestResponse> {
    return mergePullRequest(this.ctx, owner, repo, prNumber, body);
  }

  setPullRequestState(
    owner: string,
    repo: string,
    prNumber: number,
    state: 'open' | 'closed',
  ): Promise<PullRequestDetail> {
    return setPullRequestState(this.ctx, owner, repo, prNumber, state);
  }

  markPullRequestReadyForReview(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestDetail> {
    return markPullRequestReadyForReview(this.ctx, owner, repo, prNumber);
  }

  updatePullRequestBranch(
    owner: string,
    repo: string,
    prNumber: number,
    expectedHeadSha?: string,
  ): Promise<UpdatePullRequestBranchResponse> {
    return updatePullRequestBranch(this.ctx, owner, repo, prNumber, expectedHeadSha);
  }

  invalidatePullRequestCaches(owner: string, repo: string): void {
    invalidatePullRequestCaches(this.ctx, owner, repo);
  }

  createPullRequest(
    owner: string,
    repo: string,
    options: { title: string; body?: string; head: string; base: string; draft?: boolean },
  ): Promise<{ number: number; htmlUrl: string }> {
    return createPullRequest(this.ctx, owner, repo, options);
  }
}
