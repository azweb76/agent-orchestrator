import type { ChatSessionTemplateId } from './chat-session.js';
import type { TaskSuggestionChangeStatus } from './task-suggestions.js';
import type { TaskSuggestionKind } from './types/views.js';

/** Follow-up slug: lowercase, max 63 chars. */
export const TASK_FOLLOWUP_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * User-managed catalog entry for post-session follow-up chips.
 * Built-ins cannot be deleted; name is locked when `builtIn` is true.
 */
export interface TaskFollowUp {
  id: string;
  /** Unique slug used by APIs and AI selection. */
  name: string;
  /** Chip label shown in the chat banner. */
  title: string;
  /** Short subtitle / tooltip. */
  description: string;
  /** Ready-to-send chat text (or handoff prompt for template kinds). */
  prompt: string;
  kind: TaskSuggestionKind;
  /** When `kind` is `start-template`, which session template to open. */
  template: ChatSessionTemplateId | null;
  /** When false, excluded from the AI selection catalog. */
  enabled: boolean;
  /** Seeded by the app; name is locked and delete is blocked. */
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskFollowUpRequest {
  name: string;
  title: string;
  description?: string;
  prompt: string;
  kind?: TaskSuggestionKind;
  template?: ChatSessionTemplateId | null;
  enabled?: boolean;
}

export interface UpdateTaskFollowUpRequest {
  title?: string;
  description?: string;
  prompt?: string;
  kind?: TaskSuggestionKind;
  template?: ChatSessionTemplateId | null;
  enabled?: boolean;
  /** Only allowed for non-built-in follow-ups; ignored for built-in. */
  name?: string;
}

/** Seed shape for built-in follow-ups (no id / timestamps). */
export interface BuiltInTaskFollowUpSeed {
  name: string;
  title: string;
  description: string;
  prompt: string;
  kind: TaskSuggestionKind;
  template?: ChatSessionTemplateId;
}

const CREATE_PR_PROMPT = [
  'Create a draft pull request for the current branch.',
  'Summarize the changes, write a good title and description, commit remaining work if needed, push, and open a draft PR.',
].join(' ');

/** Built-in catalog seeded once; users may edit title/description/prompt/enabled. */
export const BUILTIN_TASK_FOLLOWUPS: BuiltInTaskFollowUpSeed[] = [
  {
    name: 'commit-and-push',
    title: 'Commit and Push',
    description: 'Commit local changes and push the branch.',
    prompt:
      'Commit all local changes with a clear conventional-commit message and push the branch.',
    kind: 'commit-and-push',
  },
  {
    name: 'create-draft-pr',
    title: 'Create PR (draft)',
    description: 'Open a draft pull request for this branch.',
    prompt: CREATE_PR_PROMPT,
    kind: 'start-template',
    template: 'create-draft-pr',
  },
  {
    name: 'resolve-conflicts',
    title: 'Resolve conflicts',
    description: 'Merge or rebase and fix conflicts on the PR branch.',
    prompt:
      'Merge or rebase onto the base branch, resolve every conflict carefully, and push the result.',
    kind: 'start-template',
    template: 'resolve-conflicts',
  },
  {
    name: 'fix-ci',
    title: 'Fix CI',
    description: 'Repair failing checks on the current pull request.',
    prompt: 'Fix the failing CI checks on the current branch.',
    kind: 'start-template',
    template: 'fix-ci',
  },
  {
    name: 'address-review',
    title: 'Address review',
    description: 'Respond to open pull request review comments.',
    prompt: 'Address the pull request review feedback on the current branch.',
    kind: 'start-template',
    template: 'address-review',
  },
  {
    name: 'review-changes',
    title: 'Review changes',
    description: 'Review local and branch changes for issues.',
    prompt:
      'Review the current uncommitted and branch changes for bugs, edge cases, missing tests, and regressions.',
    kind: 'start-template',
    template: 'review',
  },
  {
    name: 'continue',
    title: 'Continue',
    description: 'Keep going from the last reply.',
    prompt: 'Continue from where we left off. Propose the next concrete step and start on it.',
    kind: 'prompt',
  },
];

export function isValidTaskFollowUpName(name: string): boolean {
  return TASK_FOLLOWUP_NAME_PATTERN.test(name.trim());
}

function checksFailing(status: TaskSuggestionChangeStatus): boolean {
  const pr = status.pr;
  if (!pr) return false;
  if (typeof pr.checksFailing === 'number' && pr.checksFailing > 0) return true;
  return pr.checksRollup === 'failure';
}

/**
 * Whether a catalog entry is eligible given live worktree / PR signals.
 * Prompt kinds are always eligible; status kinds match `buildStatusTaskSuggestionDrafts`.
 */
export function isTaskFollowUpApplicable(
  followUp: Pick<TaskFollowUp, 'kind'> & { template?: ChatSessionTemplateId | null },
  status: TaskSuggestionChangeStatus,
): boolean {
  if (followUp.kind === 'prompt' || !followUp.kind) return true;

  if (followUp.kind === 'commit-and-push') {
    return status.hasPendingChanges;
  }

  if (followUp.kind !== 'start-template') return true;

  const template = followUp.template ?? null;
  const hasLocalWork = status.hasBranchDiff || status.hasPendingChanges;

  if (template === 'create-draft-pr') return !status.hasOpenPr;
  if (template === 'resolve-conflicts') {
    return Boolean(status.hasOpenPr && status.pr && status.pr.mergeableState === 'dirty');
  }
  if (template === 'fix-ci') {
    return Boolean(status.hasOpenPr && checksFailing(status));
  }
  if (template === 'address-review') {
    return Boolean(status.hasOpenPr && (status.pr?.reviewCommentCount ?? 0) > 0);
  }
  if (template === 'review') return hasLocalWork;

  return true;
}

/** Filter catalog entries to those eligible for the current change status. */
export function filterApplicableTaskFollowUps<
  T extends Pick<TaskFollowUp, 'kind'> & { template?: ChatSessionTemplateId | null },
>(followUps: readonly T[], status: TaskSuggestionChangeStatus): T[] {
  return followUps.filter((item) => isTaskFollowUpApplicable(item, status));
}
