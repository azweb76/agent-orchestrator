import type {
  GitHubPullRequest,
  GitHubRepository,
  PullRequestCheck,
  PullRequestDetail,
  PullRequestMergeMethod,
  PullRequestMergeableState,
  PullRequestUser,
} from '@agent-orchestrator/shared';
import type {
  RawCheckRun,
  RawCommitStatus,
  RawPullRequest,
  RawPullRequestDetail,
  RawRepoSettings,
  RawUser,
  SearchedPullRequest,
} from './raw-types.js';

export function mapPullRequest(pr: RawPullRequest): GitHubPullRequest {
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

export function mapSearchedPullRequest(item: SearchedPullRequest): GitHubPullRequest {
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
export function sanitizePullRequestSearchText(query: string): string {
  return query.replace(/[:"']/g, ' ').replace(/\s+/g, ' ').trim();
}

export function mapRepository(repo: {
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

/** True while GitHub has not finished computing mergeability for an open PR. */
export function isMergeabilityPending(pr: RawPullRequestDetail): boolean {
  if (pr.state !== 'open' || pr.merged) return false;
  return pr.mergeable === null || pr.mergeable_state === 'unknown';
}

export function mapUser(user: RawUser | null | undefined): PullRequestUser | null {
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

export function mapPullRequestDetail(
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
    archived: Boolean(settings.archived),
    workspaceId: null,
    agentId: null,
  };
}

export function mapCheckRun(run: RawCheckRun): PullRequestCheck {
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
export function mapCommitStatus(status: RawCommitStatus): PullRequestCheck {
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
