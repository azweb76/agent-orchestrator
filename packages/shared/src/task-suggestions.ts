import type { ChatSessionTemplateId } from './chat-session.js';
import { BUILTIN_TASK_FOLLOWUPS } from './task-followup.js';
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
  description?: string;
  prompt: string;
  kind?: TaskSuggestionKind;
  template?: ChatSessionTemplateId;
}

function builtinDraft(name: string): TaskSuggestionDraft {
  const seed = BUILTIN_TASK_FOLLOWUPS.find((item) => item.name === name);
  if (!seed) throw new Error(`Missing built-in follow-up seed: ${name}`);
  return {
    title: seed.title,
    description: seed.description,
    prompt: seed.prompt,
    kind: seed.kind,
    template: seed.template,
  };
}

/** Fallback when neither status nor the LLM yields suggestions. */
export const FALLBACK_TASK_SUGGESTION: TaskSuggestionDraft = builtinDraft('continue');

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
  const hasLocalWork = status.hasBranchDiff || status.hasPendingChanges;

  if (status.hasPendingChanges) {
    drafts.push(builtinDraft('commit-and-push'));
  }

  if (status.hasOpenPr) {
    const pr = status.pr;
    if (pr && hasConflicts(pr)) {
      drafts.push(builtinDraft('resolve-conflicts'));
    }
    if (pr && checksFailing(pr.checksRollup, pr.checksFailing)) {
      drafts.push(builtinDraft('fix-ci'));
    }
    if (pr && (pr.reviewCommentCount ?? 0) > 0) {
      drafts.push(builtinDraft('address-review'));
    }
  } else {
    // Match the agent header: offer draft PR whenever none is linked yet.
    drafts.push(builtinDraft('create-draft-pr'));
  }

  if (hasLocalWork) {
    drafts.push(builtinDraft('review-changes'));
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
    merged.push({
      title,
      description: draft.description,
      prompt,
      kind: draft.kind ?? 'prompt',
      template: draft.template,
    });
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
    description: draft.description,
    prompt: draft.prompt,
    kind: draft.kind ?? 'prompt',
    template: draft.template,
  }));
}
