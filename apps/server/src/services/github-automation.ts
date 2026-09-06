import type { PullRequestChecksRollup } from '@agent-orchestrator/shared';
import { GitHubApiError } from './github/errors.js';
import type { AppContext } from './app-context.js';
import { notify } from './app-context.js';
import type { PollTarget } from './github-poll-targets.js';
import { pollTargetKey } from './github-poll-targets.js';
import { cachePrStatusFromDetail } from './pr-status-cache.js';

export { cachePrStatusFromDetail, getCachedPrStatus, setCachedPrStatus } from './pr-status-cache.js';

export type GithubPrChangeKind = 'checks' | 'reviews' | 'merged' | 'state';

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

function mergedStateKey(target: PollTarget): string {
  return `merged:${pollTargetKey(target)}`;
}

function archivedStateKey(target: PollTarget): string {
  return `archived:${pollTargetKey(target)}`;
}

function stateDraftKey(target: PollTarget): string {
  return `state-draft:${pollTargetKey(target)}`;
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

export async function pollTargetState(
  ctx: AppContext,
  target: PollTarget,
): Promise<GithubPrChangeEvent[]> {
  const events: GithubPrChangeEvent[] = [];
  const detail = await ctx.github.getPullRequestDetail(target.owner, target.repo, target.number);

  const stateDraftKeyValue = stateDraftKey(target);
  const stateDraftPayload = JSON.stringify({ state: detail.state, draft: detail.draft });
  const prevStateDraft = ctx.repos.automationState.get(stateDraftKeyValue);
  if (prevStateDraft !== null && prevStateDraft !== stateDraftPayload) {
    const event: GithubPrChangeEvent = {
      kind: 'state',
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      agentId: target.agentId,
    };
    events.push(event);
    emitPrChanged(ctx, event);
  }
  ctx.repos.automationState.set(stateDraftKeyValue, stateDraftPayload);

  if (detail.merged) {
    if (target.agentId) {
      const agent = ctx.repos.agents.getById(target.agentId);
      const alreadyArchived =
        !agent || agent.archivedAt || ctx.repos.automationState.get(archivedStateKey(target)) === '1';
      if (!alreadyArchived) {
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
    } else {
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
    }
    cachePrStatusFromDetail(ctx, target.owner, target.repo, {
      number: target.number,
      state: detail.state,
      draft: detail.draft,
      merged: detail.merged,
      mergeable: detail.mergeable,
      mergeableState: detail.mergeableState,
      reviewCommentCount: 0,
    });
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

  cachePrStatusFromDetail(
    ctx,
    target.owner,
    target.repo,
    {
      number: target.number,
      state: detail.state,
      draft: detail.draft,
      merged: detail.merged,
      mergeable: detail.mergeable,
      mergeableState: detail.mergeableState,
      reviewCommentCount: comments.length,
    },
    { rollup: checks.rollup, failing: checks.failing },
  );

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

export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof GitHubApiError)) return false;
  if (error.status === 403 && /rate limit/i.test(error.message)) return true;
  if (error.status === 429) return true;
  return false;
}
