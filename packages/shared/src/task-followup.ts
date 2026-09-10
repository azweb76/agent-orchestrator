import type { ChatSessionTemplateId } from './chat-session.js';
import type { TaskSuggestionKind } from './types/views.js';

/** Follow-up slug: lowercase, max 63 chars. */
export const TASK_FOLLOWUP_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

export type TaskFollowUpTrigger = 'session-complete' | 'exit-plan-mode';

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
  /** Ready-to-send chat text (current chat, or new chat on Cmd/Ctrl-click). */
  prompt: string;
  kind: TaskSuggestionKind;
  /** When `kind` is `start-template`, which session template to open. */
  template: ChatSessionTemplateId | null;
  /** When false, excluded from the AI selection catalog. */
  enabled: boolean;
  /**
   * When this follow-up is eligible for AI selection: after a session run
   * completes, or when a plan is presented via ExitPlanMode.
   */
  trigger: TaskFollowUpTrigger;
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
  trigger?: TaskFollowUpTrigger;
}

export interface UpdateTaskFollowUpRequest {
  title?: string;
  description?: string;
  prompt?: string;
  kind?: TaskSuggestionKind;
  template?: ChatSessionTemplateId | null;
  enabled?: boolean;
  trigger?: TaskFollowUpTrigger;
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
  trigger: TaskFollowUpTrigger;
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
    trigger: 'session-complete',
  },
  {
    name: 'create-draft-pr',
    title: 'Create PR (draft)',
    description: 'Open a draft pull request for this branch.',
    prompt: CREATE_PR_PROMPT,
    kind: 'start-template',
    template: 'create-draft-pr',
    trigger: 'session-complete',
  },
  {
    name: 'resolve-conflicts',
    title: 'Resolve conflicts',
    description: 'Merge or rebase and fix conflicts on the PR branch.',
    prompt:
      'Merge or rebase onto the base branch, resolve every conflict carefully, and push the result.',
    kind: 'start-template',
    template: 'resolve-conflicts',
    trigger: 'session-complete',
  },
  {
    name: 'fix-ci',
    title: 'Fix CI',
    description: 'Repair failing checks on the current pull request.',
    prompt: 'Fix the failing CI checks on the current branch.',
    kind: 'start-template',
    template: 'fix-ci',
    trigger: 'session-complete',
  },
  {
    name: 'address-review',
    title: 'Address review',
    description: 'Respond to open pull request review comments.',
    prompt: 'Address the pull request review feedback on the current branch.',
    kind: 'start-template',
    template: 'address-review',
    trigger: 'session-complete',
  },
  {
    name: 'review-changes',
    title: 'Review changes',
    description: 'Review local and branch changes for issues.',
    prompt:
      'Review the current uncommitted and branch changes for bugs, edge cases, missing tests, and regressions.',
    kind: 'start-template',
    template: 'review',
    trigger: 'session-complete',
  },
  {
    name: 'continue',
    title: 'Continue',
    description: 'Keep going from the last reply.',
    prompt: 'Continue from where we left off. Propose the next concrete step and start on it.',
    kind: 'prompt',
    trigger: 'session-complete',
  },
  {
    name: 'grade-session',
    title: 'Grade session',
    description: 'Review this run for speed, token waste, and repeat corrections.',
    prompt:
      'Open the session grade dialog to analyze efficiency (turns, tokens, context) and instruction quality.',
    kind: 'grade-session',
    trigger: 'session-complete',
  },
];

export function isValidTaskFollowUpName(name: string): boolean {
  return TASK_FOLLOWUP_NAME_PATTERN.test(name.trim());
}
