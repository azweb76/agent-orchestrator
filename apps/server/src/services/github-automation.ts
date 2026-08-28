import type { PullRequestChecksRollup } from '@agent-orchestrator/shared';
import { FIX_CI_RETRY_CAP } from '@agent-orchestrator/shared';
import { GitHubApiError } from './github/errors.js';
import type { AppContext } from './app-context.js';
import { notify } from './app-context.js';
import { archiveAgent } from './agents-lifecycle.js';
import { getAutomationSettings } from './automation-settings.js';
import { hasActiveOrQueuedTemplate, startAutomationTemplate } from './automation-templates.js';
import type { PollTarget } from './github-poll-targets.js';
import { pollTargetKey } from './github-poll-targets.js';

export type GithubPrChangeKind = 'checks' | 'reviews' | 'merged';

export interface GithubPrChangeEvent {
  kind: GithubPrChangeKind;
  owner: string;
  repo: string;
  number: number;
  agentId: string | null;
  headSha?: string;
  checksRollup?: PullRequestChecksRollup;
  reviewIds?: string[];
  commentIds?: string[];
  merged?: boolean;
}

function checksStateKey(target: PollTarget): string {
  return `checks:${pollTargetKey(target)}`;
}

function reviewsStateKey(target: PollTarget): string {
  return `reviews:${pollTargetKey(target)}`;
}

function fixCiAttemptsKey(agentId: string, headSha: string): string {
  return `fix-ci:${agentId}:${headSha}`;
}

function mergedStateKey(target: PollTarget): string {
  return `merged:${pollTargetKey(target)}`;
}

function emitPrChanged(ctx: AppContext, event: GithubPrChangeEvent): void {
  notify(ctx, 'github_pr_changed', {
    agentId: event.agentId ?? undefined,
    data: {
      kind: event.kind,
      owner: event.owner,
      repo: event.repo,
      number: event.number,
      headSha: event.headSha,
      checksRollup: event.checksRollup,
      reviewIds: event.reviewIds,
      commentIds: event.commentIds,
      merged: event.merged,
    },
  });
}

function emitAutomation(
  ctx: AppContext,
  agentId: string,
  action: string,
  data: Record<string, unknown>,
): void {
  notify(ctx, 'automation_triggered', {
    agentId,
    data: { action, ...data },
  });
}

export async function pollTargetState(
  ctx: AppContext,
  target: PollTarget,
): Promise<GithubPrChangeEvent[]> {
  const events: GithubPrChangeEvent[] = [];
  const detail = await ctx.github.getPullRequestDetail(target.owner, target.repo, target.number);

  if (detail.merged) {
    const mergedKey = mergedStateKey(target);
    const wasMerged = ctx.repos.automationState.get(mergedKey) === '1';
    if (!wasMerged) {
      ctx.repos.automationState.set(mergedKey, '1');
      const event: GithubPrChangeEvent = {
        kind: 'merged',
        owner: target.owner,
        repo: target.repo,
        number: target.number,
        agentId: target.agentId,
        merged: true,
      };
      events.push(event);
      emitPrChanged(ctx, event);
    }
    return events;
  }

  const checks = await ctx.github.getPullRequestChecks(
    target.owner,
    target.repo,
    detail.headSha,
  );
  const checksKey = checksStateKey(target);
  const prevChecks = ctx.repos.automationState.get(checksKey);
  const checksPayload = JSON.stringify({ headSha: detail.headSha, rollup: checks.rollup });
  if (prevChecks !== checksPayload) {
    ctx.repos.automationState.set(checksKey, checksPayload);
    let prevRollup: PullRequestChecksRollup | undefined;
    let prevHeadSha: string | undefined;
    if (prevChecks) {
      try {
        const parsed = JSON.parse(prevChecks) as { rollup?: PullRequestChecksRollup; headSha?: string };
        prevRollup = parsed.rollup;
        prevHeadSha = parsed.headSha;
      } catch {
        // ignore corrupt state
      }
    }
    const failureTransition =
      checks.rollup === 'failure' &&
      (prevRollup !== 'failure' || prevHeadSha !== detail.headSha);
    const event: GithubPrChangeEvent = {
      kind: 'checks',
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      agentId: target.agentId,
      headSha: detail.headSha,
      checksRollup: failureTransition ? 'failure' : checks.rollup,
    };
    events.push(event);
    emitPrChanged(ctx, event);
  }

  const [reviews, comments] = await Promise.all([
    ctx.github.listPullRequestReviews(target.owner, target.repo, target.number),
    ctx.github.listPullRequestReviewComments(target.owner, target.repo, target.number),
  ]);

  const reviewIds = reviews.map((item) => String(item.id));
  const commentIds = comments.map((item) => String(item.id));
  const reviewsKey = reviewsStateKey(target);
  const seen = ctx.repos.automationState.getJsonSet(reviewsKey);
  const seeding = seen.size === 0;
  const newReviewIds = reviewIds.filter((id) => !seen.has(`review:${id}`));
  const newCommentIds = commentIds.filter((id) => !seen.has(`comment:${id}`));
  const reviewRequestedNew = target.reviewRequested && !seen.has('review_requested');

  for (const id of reviewIds) seen.add(`review:${id}`);
  for (const id of commentIds) seen.add(`comment:${id}`);
  if (target.reviewRequested) seen.add('review_requested');
  ctx.repos.automationState.setJsonSet(reviewsKey, seen);

  if (!seeding && (newReviewIds.length > 0 || newCommentIds.length > 0 || reviewRequestedNew)) {
    const event: GithubPrChangeEvent = {
      kind: 'reviews',
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      agentId: target.agentId,
      reviewIds: newReviewIds,
      commentIds: newCommentIds,
    };
    events.push(event);
    emitPrChanged(ctx, event);
  }

  return events;
}

export async function handleAutomationEvents(
  ctx: AppContext,
  target: PollTarget,
  events: GithubPrChangeEvent[],
): Promise<void> {
  const settings = getAutomationSettings(ctx);
  if (!target.agentId) return;

  const agent = ctx.repos.agents.getById(target.agentId);
  if (!agent || agent.archivedAt) return;

  for (const event of events) {
    if (event.kind === 'checks' && settings.autoFixCi && event.checksRollup === 'failure') {
      await maybeAutoFixCi(ctx, target, event);
    }
    if (event.kind === 'reviews' && settings.autoAddressReview) {
      await maybeAutoAddressReview(ctx, target, event);
    }
    if (event.kind === 'merged' && settings.autoArchiveOnMerge) {
      await maybeAutoArchive(ctx, target, settings);
    }
  }
}

async function maybeAutoFixCi(
  ctx: AppContext,
  target: PollTarget,
  event: GithubPrChangeEvent,
): Promise<void> {
  if (!target.agentId || !event.headSha) return;
  if (!target.authored && !target.worktreeId) return;
  if (hasActiveOrQueuedTemplate(ctx, target.agentId, 'fix-ci')) return;

  const attemptsKey = fixCiAttemptsKey(target.agentId, event.headSha);
  const attempts = ctx.repos.automationState.getNumber(attemptsKey);
  if (attempts >= FIX_CI_RETRY_CAP) {
    emitAutomation(ctx, target.agentId, 'fix_ci_cap_hit', {
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      headSha: event.headSha,
      attempts,
      cap: FIX_CI_RETRY_CAP,
    });
    return;
  }

  const session = await startAutomationTemplate(ctx, target.agentId, 'fix-ci');
  if (!session) return;

  ctx.repos.automationState.increment(attemptsKey);
  emitAutomation(ctx, target.agentId, 'fix_ci_started', {
    owner: target.owner,
    repo: target.repo,
    number: target.number,
    headSha: event.headSha,
    sessionId: session.id,
    attempt: attempts + 1,
  });
}

async function maybeAutoAddressReview(
  ctx: AppContext,
  target: PollTarget,
  event: GithubPrChangeEvent,
): Promise<void> {
  if (!target.agentId) return;
  const hasNew =
    (event.reviewIds?.length ?? 0) > 0 ||
    (event.commentIds?.length ?? 0) > 0 ||
    target.reviewRequested;
  if (!hasNew) return;

  const session = await startAutomationTemplate(ctx, target.agentId, 'address-review');
  if (!session) {
    if (hasActiveOrQueuedTemplate(ctx, target.agentId, 'address-review')) return;
    emitAutomation(ctx, target.agentId, 'address_review_blocked', {
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      reason: 'worktree_busy',
    });
    return;
  }

  emitAutomation(ctx, target.agentId, 'address_review_started', {
    owner: target.owner,
    repo: target.repo,
    number: target.number,
    sessionId: session.id,
  });
}

async function maybeAutoArchive(
  ctx: AppContext,
  target: PollTarget,
  settings: ReturnType<typeof getAutomationSettings>,
): Promise<void> {
  if (!target.agentId || !target.worktreeId) return;

  const worktree = ctx.repos.worktrees.getById(target.worktreeId);
  if (!worktree?.prNumber) {
    emitAutomation(ctx, target.agentId, 'archive_skipped', {
      reason: 'no_linked_pr',
      owner: target.owner,
      repo: target.repo,
      number: target.number,
    });
    return;
  }

  const dirty = await ctx.git.hasChanges(worktree.path);
  if (dirty && !settings.autoArchiveAllowDirty) {
    emitAutomation(ctx, target.agentId, 'archive_skipped', {
      reason: 'dirty_worktree',
      owner: target.owner,
      repo: target.repo,
      number: target.number,
    });
    return;
  }

  await archiveAgent(ctx, target.agentId, {
    deleteWorktree: settings.autoArchiveDeleteWorktree,
  });
  emitAutomation(ctx, target.agentId, 'archive_completed', {
    owner: target.owner,
    repo: target.repo,
    number: target.number,
    deletedWorktree: settings.autoArchiveDeleteWorktree,
  });
}

export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof GitHubApiError)) return false;
  if (error.status === 403 && /rate limit/i.test(error.message)) return true;
  if (error.status === 429) return true;
  return false;
}
