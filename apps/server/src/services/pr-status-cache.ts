import type { PrStatusSnapshot, PullRequestChecksRollup } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { pollTargetKey } from './github-poll-targets.js';

function statusStateKey(owner: string, repo: string, number: number): string {
  return `status:${pollTargetKey({ owner, repo, number })}`;
}

export function getCachedPrStatus(
  ctx: AppContext,
  owner: string,
  repo: string,
  number: number,
): PrStatusSnapshot | null {
  const raw = ctx.repos.automationState.get(statusStateKey(owner, repo, number));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PrStatusSnapshot;
  } catch {
    return null;
  }
}

/** Persist a PR snapshot for sidebar / flight-controller delivery phase (no poll required). */
export function setCachedPrStatus(
  ctx: AppContext,
  owner: string,
  repo: string,
  number: number,
  snapshot: PrStatusSnapshot,
): void {
  ctx.repos.automationState.set(statusStateKey(owner, repo, number), JSON.stringify(snapshot));
}

/** Build + cache a snapshot from a live PR detail (and optional checks rollup). */
export function cachePrStatusFromDetail(
  ctx: AppContext,
  owner: string,
  repo: string,
  detail: {
    number: number;
    state: string;
    draft: boolean;
    merged: boolean;
    mergeable?: boolean | null;
    mergeableState?: PrStatusSnapshot['mergeableState'];
    reviewCommentCount?: number;
  },
  checks?: { rollup: PullRequestChecksRollup; failing?: number } | null,
): PrStatusSnapshot {
  const snapshot: PrStatusSnapshot = {
    state: detail.state === 'open' ? 'open' : 'closed',
    draft: detail.draft,
    merged: detail.merged,
    checksRollup: detail.merged ? 'none' : (checks?.rollup ?? 'none'),
    updatedAt: new Date().toISOString(),
    mergeable: detail.mergeable ?? null,
    mergeableState: detail.mergeableState ?? 'unknown',
    reviewCommentCount: detail.reviewCommentCount ?? 0,
    checksFailing: detail.merged ? 0 : (checks?.failing ?? 0),
  };
  setCachedPrStatus(ctx, owner, repo, detail.number, snapshot);
  return snapshot;
}
