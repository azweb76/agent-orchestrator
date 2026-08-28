import type {
  ChatSessionTemplateId,
  GitHubPullRequest,
  PullRequestCheck,
  PullRequestComment,
  PullRequestReview,
  PullRequestReviewComment,
  Workspace,
  Worktree,
} from '@agent-orchestrator/shared';
import type { AppRepositories } from '../db/index.js';
import type { GitHubService } from './github.js';

const FAILING_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);

const MAX_KICKOFF_CHARS = 14_000;
const MAX_ITEM_BODY = 400;
const MAX_INLINE_COMMENTS = 35;
const MAX_CONVERSATION_COMMENTS = 20;
const MAX_CHECK_LOG_CHARS = 320;

const ADDRESS_REVIEW_INSPECT =
  'Start by inspecting the open PR, its reviews, review comments, and conversation comments.';
const FIX_CI_INSPECT =
  'Start by inspecting the open pull request (if any) and its check runs or commit statuses.';

export interface SessionKickoffDeps {
  repos: AppRepositories;
  github: GitHubService;
}

interface ResolvedOpenPr {
  summary: GitHubPullRequest;
  headSha: string;
}

export async function buildTemplateKickoffPrompt(
  deps: SessionKickoffDeps,
  worktreeId: string,
  templateId: ChatSessionTemplateId,
  basePrompt: string,
): Promise<string> {
  if (templateId !== 'address-review' && templateId !== 'fix-ci') {
    return basePrompt;
  }

  const worktree = deps.repos.worktrees.getById(worktreeId);
  if (!worktree) return basePrompt;
  const workspace = deps.repos.workspaces.getById(worktree.workspaceId);
  if (!workspace) return basePrompt;

  try {
    if (templateId === 'address-review') {
      return await buildAddressReviewKickoff(deps.github, workspace, worktree, basePrompt);
    }
    return await buildFixCiKickoff(deps.github, workspace, worktree, basePrompt);
  } catch (error) {
    const note = `Could not load PR/CI context: ${formatError(error)}`;
    return joinSections([note, fallbackPrompt(templateId, basePrompt)]);
  }
}

function fallbackPrompt(templateId: 'address-review' | 'fix-ci', basePrompt: string): string {
  const inspect = templateId === 'address-review' ? ADDRESS_REVIEW_INSPECT : FIX_CI_INSPECT;
  return `${basePrompt} ${inspect}`;
}

async function resolveOpenPullRequest(
  github: GitHubService,
  workspace: Workspace,
  worktree: Worktree,
): Promise<ResolvedOpenPr | null> {
  const pr = await github.getOpenPullRequestForBranch(
    workspace.githubOwner,
    workspace.githubRepo,
    worktree.branch,
  );
  if (!pr) return null;

  const detail = await github.getPullRequestDetail(
    workspace.githubOwner,
    workspace.githubRepo,
    pr.number,
  );
  return { summary: pr, headSha: detail.headSha };
}

async function buildAddressReviewKickoff(
  github: GitHubService,
  workspace: Workspace,
  worktree: Worktree,
  basePrompt: string,
): Promise<string> {
  const resolved = await resolveOpenPullRequest(github, workspace, worktree);
  if (!resolved) {
    return joinSections([
      `No open pull request was found for branch \`${worktree.branch}\`.`,
      basePrompt,
    ]);
  }

  const { summary: pr } = resolved;
  const [reviewComments, reviews, conversation] = await Promise.all([
    github.listPullRequestReviewComments(workspace.githubOwner, workspace.githubRepo, pr.number),
    github.listPullRequestReviews(workspace.githubOwner, workspace.githubRepo, pr.number),
    github.listPullRequestComments(workspace.githubOwner, workspace.githubRepo, pr.number),
  ]);

  const reviewSummaries = reviews.filter(
    (item) => item.body.trim() && item.state !== 'PENDING',
  );
  const hasFeedback =
    reviewComments.some((item) => item.body.trim()) ||
    reviewSummaries.length > 0 ||
    conversation.some((item) => item.body.trim());

  if (!hasFeedback) {
    return joinSections([
      formatPrHeader(pr, worktree.branch),
      `No review comments or conversation comments were found on PR #${pr.number}.`,
      basePrompt,
    ]);
  }

  return capLength(
    joinSections(
      [
        formatPrHeader(pr, worktree.branch),
        formatInlineReviewComments(reviewComments),
        formatReviewSummaries(reviewSummaries),
        formatConversationComments(conversation),
        basePrompt,
      ].filter((part): part is string => Boolean(part)),
    ),
  );
}

async function buildFixCiKickoff(
  github: GitHubService,
  workspace: Workspace,
  worktree: Worktree,
  basePrompt: string,
): Promise<string> {
  const resolved = await resolveOpenPullRequest(github, workspace, worktree);
  let headSha = resolved?.headSha ?? null;
  const prLabel = resolved ? `PR #${resolved.summary.number}` : null;

  if (!headSha) {
    headSha = await github.getBranchHeadSha(
      workspace.githubOwner,
      workspace.githubRepo,
      worktree.branch,
    );
  }

  if (!headSha) {
    return joinSections([
      `No open pull request was found for branch \`${worktree.branch}\`, and the branch head could not be resolved on GitHub.`,
      basePrompt,
    ]);
  }

  const checks = await github.getPullRequestChecks(
    workspace.githubOwner,
    workspace.githubRepo,
    headSha,
  );
  const failing = checks.checks.filter(
    (check) => check.conclusion && FAILING_CONCLUSIONS.has(check.conclusion),
  );
  const passing = checks.checks.filter((check) => check.conclusion === 'success');

  const header = resolved
    ? formatPrHeader(resolved.summary, worktree.branch, headSha)
    : [
        `Branch \`${worktree.branch}\` (commit ${headSha.slice(0, 7)})`,
        `No open pull request was found for this branch.`,
      ].join('\n');

  if (failing.length === 0) {
    const greenNote =
      passing.length > 0
        ? `No failing CI checks were found for ${prLabel ?? `branch \`${worktree.branch}\``}. All ${passing.length} checks are passing.`
        : `No CI check runs or commit statuses were found for ${prLabel ?? `branch \`${worktree.branch}\``}.`;
    return joinSections([
      header,
      greenNote,
      'If you believe a check is still failing, say what you checked and ask how to proceed. Do not merge.',
    ]);
  }

  return capLength(
    joinSections(
      [header, formatFailingChecks(failing), formatPassingChecksSummary(passing), basePrompt].filter(
        (part): part is string => Boolean(part),
      ),
    ),
  );
}

function formatPrHeader(pr: GitHubPullRequest, branch: string, headSha?: string): string {
  const lines = [
    `## Pull request context`,
    `PR #${pr.number} (open): ${pr.title}`,
    pr.htmlUrl,
    `Branch \`${branch}\` → \`${pr.baseRef}\``,
  ];
  if (headSha) {
    lines.push(`Head commit: ${headSha}`);
  }
  return lines.join('\n');
}

function formatInlineReviewComments(comments: PullRequestReviewComment[]): string | null {
  const withBody = comments.filter((item) => item.body.trim());
  if (withBody.length === 0) return null;

  const lines = ['### Inline review comments'];
  const sorted = [...withBody].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const limited = sorted.slice(0, MAX_INLINE_COMMENTS);
  for (const comment of limited) {
    const author = comment.author?.login ?? 'unknown';
    const location =
      comment.path != null
        ? `${comment.path}${comment.line != null ? `:${comment.line}` : ''}`
        : 'general';
    lines.push(`- @${author} ${location}: ${truncate(comment.body, MAX_ITEM_BODY)}`);
  }
  if (sorted.length > limited.length) {
    lines.push(`- … ${sorted.length - limited.length} more inline comments not shown`);
  }
  return lines.join('\n');
}

function formatReviewSummaries(reviews: PullRequestReview[]): string | null {
  if (reviews.length === 0) return null;

  const lines = ['### Review summaries'];
  for (const review of reviews) {
    const author = review.author?.login ?? 'unknown';
    lines.push(
      `- @${author} (${review.state}): ${truncate(review.body, MAX_ITEM_BODY)}`,
    );
  }
  return lines.join('\n');
}

function formatConversationComments(comments: PullRequestComment[]): string | null {
  const withBody = comments.filter((item) => item.body.trim());
  if (withBody.length === 0) return null;

  const lines = ['### Conversation comments'];
  const sorted = [...withBody].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const limited = sorted.slice(0, MAX_CONVERSATION_COMMENTS);
  for (const comment of limited) {
    const author = comment.author?.login ?? 'unknown';
    lines.push(`- @${author}: ${truncate(comment.body, MAX_ITEM_BODY)}`);
  }
  if (sorted.length > limited.length) {
    lines.push(`- … ${sorted.length - limited.length} more conversation comments not shown`);
  }
  return lines.join('\n');
}

function formatFailingChecks(checks: PullRequestCheck[]): string {
  const lines = ['### Failing checks'];
  for (const check of checks) {
    const url = check.detailsUrl ? ` ${check.detailsUrl}` : '';
    lines.push(`- **${check.name}** (${check.conclusion ?? 'unknown'})${url}`);
    const excerpt = checkLogExcerpt(check);
    if (excerpt) {
      lines.push(`  ${excerpt}`);
    }
  }
  return lines.join('\n');
}

function formatPassingChecksSummary(passing: PullRequestCheck[]): string | null {
  if (passing.length === 0) return null;
  return `${passing.length} other check(s) passed.`;
}

function checkLogExcerpt(check: PullRequestCheck): string | null {
  const text = check.summary?.trim();
  if (!text) return null;
  return `Log excerpt: ${truncate(text, MAX_CHECK_LOG_CHARS)}`;
}

function truncate(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function joinSections(parts: string[]): string {
  return parts.filter((part) => part.trim()).join('\n\n');
}

function capLength(text: string): string {
  if (text.length <= MAX_KICKOFF_CHARS) return text;
  return `${text.slice(0, MAX_KICKOFF_CHARS - 24)}\n\n…(context truncated)…`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
