import { evaluateMergeReadiness } from '@agent-orchestrator/shared';
import type {
  ChatSession,
  PullRequestChecks,
  PullRequestChecksRollup,
  PullRequestDetail,
} from '@agent-orchestrator/shared';
import {
  PULL_REQUEST_STATUS_LABELS,
  resolvePullRequestStatus,
  type PullRequestStatusKind,
} from '../pr/pullRequestStatus';

const CHECKS_LABEL: Record<PullRequestChecksRollup, string> = {
  success: 'Checks passing',
  failure: 'Checks failing',
  pending: 'Checks running',
  neutral: 'Checks neutral',
  none: 'No checks',
};

export interface AgentPrStripModel {
  prStatus: PullRequestStatusKind;
  stateLabel: string;
  checksLabel: string | null;
  checksTone: 'success' | 'error' | 'warning' | 'default';
  reviewLabel: string | null;
  mergeHint: string | null;
  showFixCi: boolean;
  showAddressReview: boolean;
  showMarkReady: boolean;
  open: boolean;
}

export type AgentPrActionKind = 'fix_ci' | 'address_review' | 'mark_ready' | 'merge';

export interface AgentPrActionOffer {
  kind: AgentPrActionKind;
  /** Stable id for dismiss state (includes head SHA / counts where relevant). */
  fingerprint: string;
  title: string;
  body: string;
  severity: 'error' | 'warning' | 'info' | 'success';
}

function templateBusy(
  sessions: readonly Pick<ChatSession, 'template' | 'status'>[] | undefined,
  template: 'fix-ci' | 'address-review',
): boolean {
  return Boolean(
    sessions?.some(
      (session) =>
        session.template === template &&
        (session.status === 'running' || session.status === 'queued'),
    ),
  );
}

/** Derive the agent-page PR strip labels and which actions to offer. */
export function buildAgentPrStripModel(input: {
  pr: PullRequestDetail;
  checks?: PullRequestChecks | null;
  archived?: boolean;
}): AgentPrStripModel {
  const { pr, checks = null, archived = false } = input;
  const open = pr.state === 'open' && !pr.merged;
  const readiness = evaluateMergeReadiness(pr);
  const prStatus = resolvePullRequestStatus(pr);
  const stateLabel = PULL_REQUEST_STATUS_LABELS[prStatus];

  const rollup = checks?.rollup ?? null;
  const checksLabel =
    rollup == null
      ? null
      : checks && checks.total > 0
        ? `${CHECKS_LABEL[rollup]} (${checks.passing}/${checks.total})`
        : CHECKS_LABEL[rollup];

  let checksTone: AgentPrStripModel['checksTone'] = 'default';
  if (rollup === 'success') checksTone = 'success';
  else if (rollup === 'failure') checksTone = 'error';
  else if (rollup === 'pending') checksTone = 'warning';

  const reviewCount = pr.reviewCommentCount;
  const reviewLabel =
    reviewCount > 0
      ? reviewCount === 1
        ? '1 review comment'
        : `${reviewCount} review comments`
      : null;

  let mergeHint: string | null = null;
  if (open) {
    if (readiness.conflicted) mergeHint = 'Conflicts with base';
    else if (readiness.computing) mergeHint = 'Checking mergeability…';
    else if (readiness.canMerge) mergeHint = 'Ready to merge';
    else if (pr.draft && rollup === 'success') mergeHint = 'Mark ready when you are happy';
    else if (!pr.draft && readiness.reason) mergeHint = readiness.reason;
  }

  const canAct = open && !archived;
  return {
    prStatus,
    stateLabel,
    checksLabel,
    checksTone,
    reviewLabel,
    mergeHint,
    showFixCi: canAct && (checks?.failing ?? 0) > 0,
    showAddressReview: canAct,
    showMarkReady: canAct && pr.draft && checks?.rollup === 'success',
    open,
  };
}

/**
 * Event-style action cards for the agent page. Prefer one primary offer at a
 * time so CI / review / ready / merge do not stack into a wall of alerts.
 */
export function buildAgentPrActionOffers(input: {
  pr: PullRequestDetail;
  checks?: PullRequestChecks | null;
  archived?: boolean;
  sessions?: readonly Pick<ChatSession, 'template' | 'status'>[];
}): AgentPrActionOffer[] {
  const { pr, checks = null, archived = false, sessions } = input;
  if (archived || pr.merged || pr.state !== 'open') return [];

  const readiness = evaluateMergeReadiness(pr);
  const offers: AgentPrActionOffer[] = [];

  if ((checks?.failing ?? 0) > 0 && !templateBusy(sessions, 'fix-ci')) {
    offers.push({
      kind: 'fix_ci',
      fingerprint: `fix_ci:${pr.number}:${pr.headSha}:${checks?.failing ?? 0}`,
      title: 'CI is failing',
      body:
        checks && checks.failing === 1
          ? '1 check failed on the latest commit. Start Fix CI to investigate and push a fix.'
          : `${checks?.failing ?? 0} checks failed on the latest commit. Start Fix CI to investigate and push a fix.`,
      severity: 'error',
    });
  } else if (pr.reviewCommentCount > 0 && !templateBusy(sessions, 'address-review')) {
    offers.push({
      kind: 'address_review',
      fingerprint: `address_review:${pr.number}:${pr.reviewCommentCount}:${pr.updatedAt}`,
      title: 'Review feedback waiting',
      body:
        pr.reviewCommentCount === 1
          ? 'There is 1 review comment on this pull request. Start Address review to respond and push fixes.'
          : `There are ${pr.reviewCommentCount} review comments on this pull request. Start Address review to respond and push fixes.`,
      severity: 'warning',
    });
  } else if (pr.draft && checks?.rollup === 'success') {
    offers.push({
      kind: 'mark_ready',
      fingerprint: `mark_ready:${pr.number}:${pr.headSha}`,
      title: 'Checks are green',
      body: 'This draft looks ready. Mark it ready for review when you want human reviewers.',
      severity: 'success',
    });
  } else if (!pr.draft && readiness.canMerge) {
    offers.push({
      kind: 'merge',
      fingerprint: `merge:${pr.number}:${pr.headSha}`,
      title: 'Ready to merge',
      body: 'This pull request can be merged. Merge when you are ready — this is never automatic.',
      severity: 'success',
    });
  }

  return offers;
}
