import { evaluateMergeReadiness } from '@agent-orchestrator/shared';
import type {
  PullRequestChecks,
  PullRequestChecksRollup,
  PullRequestDetail,
} from '@agent-orchestrator/shared';

const CHECKS_LABEL: Record<PullRequestChecksRollup, string> = {
  success: 'Checks passing',
  failure: 'Checks failing',
  pending: 'Checks running',
  neutral: 'Checks neutral',
  none: 'No checks',
};

export interface AgentPrStripModel {
  stateLabel: string;
  checksLabel: string | null;
  checksTone: 'success' | 'error' | 'warning' | 'default';
  reviewLabel: string | null;
  mergeHint: string | null;
  showFixCi: boolean;
  showAddressReview: boolean;
  open: boolean;
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

  let stateLabel = 'Open';
  if (pr.merged) stateLabel = 'Merged';
  else if (pr.state !== 'open') stateLabel = 'Closed';
  else if (pr.draft) stateLabel = 'Draft';

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
    stateLabel,
    checksLabel,
    checksTone,
    reviewLabel,
    mergeHint,
    showFixCi: canAct && (checks?.failing ?? 0) > 0,
    showAddressReview: canAct,
    open,
  };
}
