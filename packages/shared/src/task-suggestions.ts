import type { ChatSessionTemplateId } from './chat-session.js';
import type { PrStatusSnapshot, PullRequestChecksRollup } from './types/github.js';
import type { TaskSuggestion, TaskSuggestionKind } from './types/views.js';

/** Worktree / PR signals used to seed status-based follow-up chips. */
export interface TaskSuggestionChangeStatus {
  hasPendingChanges: boolean;
  /** Diff vs the integration base (committed and/or pending). */
  hasBranchDiff: boolean;
  hasOpenPr: boolean;
  pr?: Pick<
    PrStatusSnapshot,
    'mergeable' | 'mergeableState' | 'reviewCommentCount' | 'checksFailing' | 'checksRollup'
  > | null;
}

export interface TaskSuggestionDraft {
  title: string;
  prompt: string;
  kind?: TaskSuggestionKind;
  template?: ChatSessionTemplateId;
}

const CREATE_PR_PROMPT = [
  'Create a draft pull request for the current branch.',
  'Summarize the changes, write a good title and description, commit remaining work if needed, push, and open a draft PR.',
].join(' ');

const COMMIT_PUSH_PROMPT =
  'Commit all local changes with a clear conventional-commit message and push the branch.';

const REVIEW_PROMPT =
  'Review the current uncommitted and branch changes for bugs, edge cases, missing tests, and regressions.';

/** Fallback when neither status nor the LLM yields suggestions. */
export const FALLBACK_TASK_SUGGESTION: TaskSuggestionDraft = {
  title: 'Continue',
  prompt: 'Continue from where we left off. Propose the next concrete step and start on it.',
  kind: 'prompt',
};

function checksFailing(
  rollup: PullRequestChecksRollup | undefined,
  failing: number | undefined,
): boolean {
  if (typeof failing === 'number' && failing > 0) return true;
  return rollup === 'failure';
}

function hasConflicts(
  pr: NonNullable<TaskSuggestionChangeStatus['pr']>,
): boolean {
  return pr.mergeableState === 'dirty';
}

/**
 * Status-driven follow-ups (Create PR, Commit and Push, Fix CI, …) based on
 * the worktree and linked PR — not the LLM transcript.
 */
export function buildStatusTaskSuggestionDrafts(
  status: TaskSuggestionChangeStatus,
): TaskSuggestionDraft[] {
  const drafts: TaskSuggestionDraft[] = [];

  if (status.hasPendingChanges) {
    drafts.push({
      title: 'Commit and Push',
      prompt: COMMIT_PUSH_PROMPT,
      kind: 'commit-and-push',
    });
  }

  if (status.hasOpenPr) {
    const pr = status.pr;
    if (pr && hasConflicts(pr)) {
      drafts.push({
        title: 'Resolve conflicts',
        prompt:
          'Merge or rebase onto the base branch, resolve every conflict carefully, and push the result.',
        kind: 'start-template',
        template: 'resolve-conflicts',
      });
    }
    if (pr && checksFailing(pr.checksRollup, pr.checksFailing)) {
      drafts.push({
        title: 'Fix CI',
        prompt: 'Fix the failing CI checks on the current branch.',
        kind: 'start-template',
        template: 'fix-ci',
      });
    }
    if (pr && (pr.reviewCommentCount ?? 0) > 0) {
      drafts.push({
        title: 'Address review',
        prompt: 'Address the pull request review feedback on the current branch.',
        kind: 'start-template',
        template: 'address-review',
      });
    }
  } else if (status.hasBranchDiff || status.hasPendingChanges) {
    drafts.push({
      title: 'Create PR (draft)',
      prompt: CREATE_PR_PROMPT,
      kind: 'start-template',
      template: 'create-draft-pr',
    });
  }

  if (status.hasBranchDiff || status.hasPendingChanges) {
    drafts.push({
      title: 'Review changes',
      prompt: REVIEW_PROMPT,
      kind: 'start-template',
      template: 'review',
    });
  }

  return drafts;
}

function looksLikeStatusDuplicate(draft: TaskSuggestionDraft, title: string, prompt: string): boolean {
  const hay = `${title} ${prompt}`.toLowerCase();
  if (draft.kind === 'commit-and-push') {
    return /\bcommit\b/.test(hay) || /\bpush\b/.test(hay);
  }
  if (draft.template === 'create-draft-pr') {
    return /\bpull request\b/.test(hay) || /\bdraft pr\b/.test(hay) || /\bcreate pr\b/.test(hay);
  }
  if (draft.template === 'fix-ci') return /\bfix ci\b/.test(hay) || /\bci check/.test(hay);
  if (draft.template === 'address-review') {
    return /\baddress review\b/.test(hay) || /\breview feedback\b/.test(hay);
  }
  if (draft.template === 'resolve-conflicts') return /\bconflict/.test(hay);
  if (draft.template === 'review') {
    return title.toLowerCase().includes('review') && !/\baddress review\b/.test(hay);
  }
  return false;
}

/**
 * Prefers status chips, then LLM prompts (dropping near-duplicates), and
 * always returns at least the continue fallback.
 */
export function mergeTaskSuggestionDrafts(
  statusDrafts: TaskSuggestionDraft[],
  llmDrafts: TaskSuggestionDraft[],
  max = 6,
): TaskSuggestionDraft[] {
  const merged: TaskSuggestionDraft[] = [...statusDrafts];
  const titles = new Set(statusDrafts.map((d) => d.title.toLowerCase()));

  for (const draft of llmDrafts) {
    if (merged.length >= max) break;
    const title = draft.title.trim();
    const prompt = draft.prompt.trim();
    if (!title || !prompt) continue;
    if (titles.has(title.toLowerCase())) continue;
    if (statusDrafts.some((s) => looksLikeStatusDuplicate(s, title, prompt))) continue;
    merged.push({ title, prompt, kind: draft.kind ?? 'prompt' });
    titles.add(title.toLowerCase());
  }

  if (merged.length === 0) merged.push(FALLBACK_TASK_SUGGESTION);
  return merged.slice(0, max);
}

export function toTaskSuggestions(
  drafts: TaskSuggestionDraft[],
  idFactory: () => string,
): TaskSuggestion[] {
  return drafts.map((draft) => ({
    id: idFactory(),
    title: draft.title,
    prompt: draft.prompt,
    kind: draft.kind ?? 'prompt',
    template: draft.template,
  }));
}
