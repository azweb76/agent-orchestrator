import type { ChatSession } from './chat-session.js';
import { isPullRequestConflicted } from './pull-request.js';
import type { AgentStatus } from './types/entities.js';
import type { PullRequestChecks, PullRequestDetail } from './types/github.js';

/**
 * Coarse delivery phase for an agent whose job is to get a PR merged.
 * Derived from sessions + linked PR signals — not a persisted workflow engine.
 */
export type AgentDeliveryPhase =
  | 'planning'
  | 'building'
  | 'needs_pr'
  | 'pr_draft'
  | 'has_conflicts'
  | 'checks_failing'
  | 'awaiting_review'
  | 'changes_requested'
  | 'ready_to_merge'
  | 'merged'
  | 'archived';

export const AGENT_DELIVERY_PHASE_LABELS: Record<AgentDeliveryPhase, string> = {
  planning: 'Planning',
  building: 'Building',
  needs_pr: 'Needs PR',
  pr_draft: 'Draft PR',
  has_conflicts: 'Conflicts',
  checks_failing: 'CI failing',
  awaiting_review: 'Awaiting review',
  changes_requested: 'Changes requested',
  ready_to_merge: 'Ready to merge',
  merged: 'Merged',
  archived: 'Archived',
};

function sessionBusy(
  sessions: readonly Pick<ChatSession, 'template' | 'status'>[],
  template: ChatSession['template'],
): boolean {
  return sessions.some(
    (session) =>
      session.template === template &&
      (session.status === 'running' || session.status === 'queued'),
  );
}

function anyBusy(
  sessions: readonly Pick<ChatSession, 'template' | 'status' | 'permissionMode'>[],
): { building: boolean; planning: boolean } {
  const building = sessions.some(
    (session) =>
      (session.template === 'build' ||
        session.template === 'fix-ci' ||
        session.template === 'address-review' ||
        session.template === 'resolve-conflicts' ||
        session.template === 'create-draft-pr') &&
      (session.status === 'running' || session.status === 'queued'),
  );
  const planning = sessions.some(
    (session) =>
      session.permissionMode === 'plan' &&
      (session.status === 'running' || session.status === 'queued'),
  );
  return { building, planning };
}

function looksMergeable(
  pr: Pick<PullRequestDetail, 'draft' | 'mergeable' | 'mergeableState'>,
): boolean {
  if (pr.draft) return false;
  if (pr.mergeable === false) return false;
  return (
    pr.mergeableState === 'clean' ||
    pr.mergeableState === 'unstable' ||
    pr.mergeableState === 'has_hooks'
  );
}

/** Resolve the agent’s PR-delivery phase from live session + PR signals. */
export function resolveAgentDeliveryPhase(input: {
  archived?: boolean;
  agentStatus?: AgentStatus;
  sessions?: readonly Pick<ChatSession, 'template' | 'status' | 'permissionMode'>[];
  /** True when Build finished with a diff and no open PR (draft-PR offer). */
  needsDraftPr?: boolean;
  pr?: Pick<
    PullRequestDetail,
    'state' | 'merged' | 'draft' | 'reviewCommentCount' | 'mergeableState' | 'mergeable'
  > | null;
  checks?: Pick<PullRequestChecks, 'rollup' | 'failing'> | null;
}): AgentDeliveryPhase {
  if (input.archived) return 'archived';

  const pr = input.pr ?? null;
  if (pr?.merged) return 'merged';

  const sessions = input.sessions ?? [];
  const { building, planning } = anyBusy(sessions);

  if (pr && pr.state === 'open') {
    if (isPullRequestConflicted(pr)) return 'has_conflicts';
    if (input.checks && input.checks.failing > 0) return 'checks_failing';
    if (pr.reviewCommentCount > 0) return 'changes_requested';
    if (looksMergeable(pr)) return 'ready_to_merge';
    if (pr.draft) return 'pr_draft';
    return 'awaiting_review';
  }

  if (input.needsDraftPr || sessionBusy(sessions, 'create-draft-pr')) return 'needs_pr';
  if (building || sessionBusy(sessions, 'build')) return 'building';
  if (planning) return 'planning';

  if (input.agentStatus === 'running') return 'building';
  return 'planning';
}
