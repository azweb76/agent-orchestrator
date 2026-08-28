export interface GitHubBranch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  headRef: string;
  baseRef: string;
  htmlUrl: string;
  draft: boolean;
  authorLogin: string;
  updatedAt: string;
}

/** Workspace-scoped PR picker payload, including the authenticated GitHub login. */
export interface WorkspacePullRequestList {
  viewerLogin: string | null;
  pullRequests: GitHubPullRequest[];
}

export interface InboxPullRequest {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  draft: boolean;
  owner: string;
  repo: string;
  authorLogin: string;
  updatedAt: string;
  /** Category for this PR relative to the authenticated user. */
  category: 'authored' | 'review_requested';
  /** Existing local workspace for this repo, if any. */
  workspaceId: string | null;
  /** Existing local agent created from this PR, if any. */
  agentId: string | null;
}

export interface PullRequestInbox {
  authored: InboxPullRequest[];
  reviewRequested: InboxPullRequest[];
}

/** How GitHub should combine the head branch into the base branch. */
export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase';

/**
 * GitHub's `mergeable_state`. Only present on the single-PR endpoint, and
 * `unknown` until GitHub finishes its background mergeability computation.
 */
export type PullRequestMergeableState =
  | 'clean'
  | 'dirty'
  | 'blocked'
  | 'behind'
  | 'unstable'
  | 'has_hooks'
  | 'draft'
  | 'unknown';

export interface PullRequestUser {
  login: string;
  avatarUrl: string | null;
  htmlUrl: string | null;
}

export interface PullRequestLabel {
  name: string;
  color: string | null;
}

export interface PullRequestDetail {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  /** Only ever `open` or `closed`; a merged PR is `closed` with `merged: true`. */
  state: string;
  draft: boolean;
  merged: boolean;
  /** `null` while GitHub is still computing mergeability. */
  mergeable: boolean | null;
  mergeableState: PullRequestMergeableState;
  rebaseable: boolean | null;
  headRef: string;
  baseRef: string;
  headSha: string;
  baseSha: string;
  htmlUrl: string;
  author: PullRequestUser | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  commentCount: number;
  reviewCommentCount: number;
  labels: PullRequestLabel[];
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  mergeCommitSha: string | null;
  /** Merge methods enabled in the repository settings. */
  allowedMergeMethods: PullRequestMergeMethod[];
  deleteBranchOnMerge: boolean;
  archived: boolean;
  /** Existing local workspace for this repo, if any. */
  workspaceId: string | null;
  /** Existing local agent created from this PR, if any. */
  agentId: string | null;
}

export interface PullRequestCheck {
  id: string;
  name: string;
  /** Check runs and legacy commit statuses are normalized into one shape. */
  source: 'check_run' | 'status';
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  summary: string | null;
  detailsUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export type PullRequestChecksRollup = 'none' | 'pending' | 'success' | 'failure' | 'neutral';

export interface PullRequestChecks {
  /** Commit the checks belong to (always the PR head, never the test merge commit). */
  headSha: string;
  rollup: PullRequestChecksRollup;
  total: number;
  passing: number;
  failing: number;
  pending: number;
  neutral: number;
  /** True when the repo has more check runs than we fetched. */
  truncated: boolean;
  checks: PullRequestCheck[];
}

export interface PrStatusSnapshot {
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  checksRollup: PullRequestChecksRollup;
  updatedAt: string;
}

export interface PullRequestReview {
  id: string;
  author: PullRequestUser | null;
  state: string;
  body: string;
  htmlUrl: string | null;
  submittedAt: string | null;
}

export interface PullRequestFile {
  filename: string;
  previousFilename: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  /** Absent for binary and oversized files. */
  patch: string | null;
  blobUrl: string | null;
}

export interface PullRequestFiles {
  /** GitHub caps this endpoint at 300 files. */
  truncated: boolean;
  files: PullRequestFile[];
}

export interface PullRequestCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorLogin: string | null;
  authoredAt: string | null;
  htmlUrl: string | null;
}

export interface PullRequestComment {
  id: string;
  author: PullRequestUser | null;
  body: string;
  htmlUrl: string | null;
  createdAt: string;
}

/** Inline review comment on a pull request diff (may be part of a thread). */
export interface PullRequestReviewComment {
  id: string;
  author: PullRequestUser | null;
  body: string;
  path: string | null;
  line: number | null;
  htmlUrl: string | null;
  createdAt: string;
  inReplyToId: string | null;
  pullRequestReviewId: string | null;
}

export type PullRequestReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface SubmitPullRequestReviewRequest {
  event: PullRequestReviewEvent;
  body?: string;
}

export interface CreatePullRequestCommentRequest {
  body: string;
}

export interface MergePullRequestRequest {
  method: PullRequestMergeMethod;
  commitTitle?: string;
  commitMessage?: string;
  /** Head sha the user saw; GitHub 409s if the branch moved since. */
  expectedHeadSha?: string;
}

export interface MergePullRequestResponse {
  merged: boolean;
  message: string;
  sha: string | null;
}

export interface UpdatePullRequestBranchRequest {
  expectedHeadSha?: string;
}

export interface UpdatePullRequestBranchResponse {
  /** GitHub queues the update asynchronously, so this only means "accepted". */
  queued: boolean;
  message: string;
}

export interface SetPullRequestStateRequest {
  state: 'open' | 'closed';
}

export interface CreateAgentFromPrRequest {
  owner: string;
  repo: string;
  prNumber: number;
  name?: string;
  /** When an agent already exists for this PR, start this template on it instead of creating a worktree. */
  template?: 'fix-ci' | 'address-review';
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  authorLogin: string;
  updatedAt: string;
}

export interface GitHubIssueComment {
  id: string;
  authorLogin: string | null;
  body: string;
  createdAt: string;
}

export interface GitHubIssueDetail extends GitHubIssue {
  comments: GitHubIssueComment[];
}

export interface InboxIssue {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  owner: string;
  repo: string;
  authorLogin: string;
  updatedAt: string;
  /** Existing local workspace for this repo, if any. */
  workspaceId: string | null;
}

export interface IssueInbox {
  assigned: InboxIssue[];
}

export interface CreateAgentFromIssueRequest {
  owner: string;
  repo: string;
  issueNumber: number;
  name?: string;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  private: boolean;
}
