import type { ChatSessionTemplateId } from './chat-session.js';
import type { PrStatusSnapshot } from './types/github.js';
import type { TaskSuggestion, TaskSuggestionKind } from './types/views.js';

/** Worktree / PR signals passed to AI when choosing follow-up chips. */
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
