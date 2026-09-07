import type {
  ChatSession,
  ChatSessionTemplateId,
  PullRequestChecks,
  PullRequestChecksRollup,
  PullRequestDetail,
} from '@agent-orchestrator/shared';
import { evaluateMergeReadiness, isPullRequestConflicted } from '@agent-orchestrator/shared';
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

export interface AgentPrStatusSummary {
  prStatus: PullRequestStatusKind;
  stateLabel: string;
  checksLabel: string | null;
  checksTone: 'success' | 'error' | 'warning' | 'default';
  mergeLabel: string | null;
  mergeTone: 'success' | 'error' | 'warning' | 'default';
  reviewLabel: string | null;
  conflicted: boolean;
  open: boolean;
  /** Contextual session starts for the strip (hidden while that template is already busy). */
  kickoffs: AgentPrKickoffTemplate[];
}

export type AgentPrKickoffTemplate = Extract<
  ChatSessionTemplateId,
  'fix-ci' | 'address-review' | 'resolve-conflicts'
>;

function templateBusy(
  sessions: readonly Pick<ChatSession, 'template' | 'status'>[] | undefined,
  template: AgentPrKickoffTemplate,
): boolean {
  return Boolean(
    sessions?.some(
      (session) =>
        session.template === template &&
        (session.status === 'running' || session.status === 'queued'),
    ),
  );
}

/** Compact labels for the agent-page PR status strip. */
export function buildAgentPrStatusSummary(input: {
  pr: PullRequestDetail;
  checks?: PullRequestChecks | null;
  archived?: boolean;
  sessions?: readonly Pick<ChatSession, 'template' | 'status'>[];
}): AgentPrStatusSummary {
  const { pr, checks = null, archived = false, sessions } = input;
  const open = pr.state === 'open' && !pr.merged;
  const readiness = evaluateMergeReadiness(pr);
  const conflicted = isPullRequestConflicted(pr);
  const prStatus = resolvePullRequestStatus(pr);

  const rollup = checks?.rollup ?? null;
  const checksLabel =
    rollup == null
      ? null
      : checks && checks.total > 0
        ? `${CHECKS_LABEL[rollup]} (${checks.passing}/${checks.total})`
        : CHECKS_LABEL[rollup];

  let checksTone: AgentPrStatusSummary['checksTone'] = 'default';
  if (conflicted) checksTone = 'error';
  else if (rollup === 'success') checksTone = 'success';
  else if (rollup === 'failure') checksTone = 'error';
  else if (rollup === 'pending') checksTone = 'warning';

  let mergeLabel: string | null = null;
  let mergeTone: AgentPrStatusSummary['mergeTone'] = 'default';
  if (open) {
    if (conflicted) {
      mergeLabel = 'Conflicts';
      mergeTone = 'error';
    } else if (readiness.computing) {
      mergeLabel = 'Checking mergeability…';
      mergeTone = 'warning';
    } else if (readiness.canMerge) {
      mergeLabel = 'Ready to merge';
      mergeTone = 'success';
    } else if (pr.draft) {
      mergeLabel = 'Draft';
    } else if (readiness.reason) {
      mergeLabel = readiness.reason;
      mergeTone = readiness.severity === 'error' ? 'error' : 'warning';
    }
  }

  const reviewCount = pr.reviewCommentCount;
  const reviewLabel =
    reviewCount > 0
      ? reviewCount === 1
        ? '1 review comment'
        : `${reviewCount} review comments`
      : null;

  const canAct = open && !archived;
  const kickoffs: AgentPrKickoffTemplate[] = [];
  if (canAct && conflicted && !templateBusy(sessions, 'resolve-conflicts')) {
    kickoffs.push('resolve-conflicts');
  }
  if (canAct && (checks?.failing ?? 0) > 0 && !templateBusy(sessions, 'fix-ci')) {
    kickoffs.push('fix-ci');
  }
  if (canAct && reviewCount > 0 && !templateBusy(sessions, 'address-review')) {
    kickoffs.push('address-review');
  }

  return {
    prStatus,
    stateLabel: PULL_REQUEST_STATUS_LABELS[prStatus],
    checksLabel,
    checksTone,
    mergeLabel,
    mergeTone,
    reviewLabel,
    conflicted,
    open,
    kickoffs,
  };
}
