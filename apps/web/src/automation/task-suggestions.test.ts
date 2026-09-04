import { describe, expect, it } from 'vitest';
import {
  buildStatusTaskSuggestionDrafts,
  mergeTaskSuggestionDrafts,
  FALLBACK_TASK_SUGGESTION,
} from '@agent-orchestrator/shared';

describe('status task suggestion drafts', () => {
  it('offers Commit and Push plus Create PR and Review when dirty without a PR', () => {
    const drafts = buildStatusTaskSuggestionDrafts({
      hasPendingChanges: true,
      hasBranchDiff: true,
      hasOpenPr: false,
    });
    expect(drafts.map((d) => d.title)).toEqual([
      'Commit and Push',
      'Create PR (draft)',
      'Review changes',
    ]);
    expect(drafts[0]?.kind).toBe('commit-and-push');
    expect(drafts[1]?.template).toBe('create-draft-pr');
  });

  it('offers Create PR when the branch has commits but a clean tree', () => {
    const drafts = buildStatusTaskSuggestionDrafts({
      hasPendingChanges: false,
      hasBranchDiff: true,
      hasOpenPr: false,
    });
    expect(drafts.map((d) => d.title)).toEqual(['Create PR (draft)', 'Review changes']);
  });

  it('offers Fix CI / Address review / Resolve conflicts from PR signals', () => {
    const drafts = buildStatusTaskSuggestionDrafts({
      hasPendingChanges: false,
      hasBranchDiff: true,
      hasOpenPr: true,
      pr: {
        mergeable: false,
        mergeableState: 'dirty',
        reviewCommentCount: 2,
        checksFailing: 1,
        checksRollup: 'failure',
      },
    });
    expect(drafts.map((d) => d.title)).toEqual([
      'Resolve conflicts',
      'Fix CI',
      'Address review',
      'Review changes',
    ]);
  });

  it('returns nothing when the tree is clean and there is no branch diff', () => {
    expect(
      buildStatusTaskSuggestionDrafts({
        hasPendingChanges: false,
        hasBranchDiff: false,
        hasOpenPr: false,
      }),
    ).toEqual([]);
  });
});

describe('mergeTaskSuggestionDrafts', () => {
  it('always includes a fallback when both sides are empty', () => {
    expect(mergeTaskSuggestionDrafts([], [])).toEqual([FALLBACK_TASK_SUGGESTION]);
  });

  it('prefers status chips and drops LLM duplicates', () => {
    const status = buildStatusTaskSuggestionDrafts({
      hasPendingChanges: true,
      hasBranchDiff: true,
      hasOpenPr: false,
    });
    const merged = mergeTaskSuggestionDrafts(status, [
      { title: 'Commit everything', prompt: 'Please commit and push the changes.' },
      { title: 'Add unit tests', prompt: 'Add unit tests for the new helper.' },
      { title: 'Create PR (draft)', prompt: 'Open a draft PR.' },
    ]);
    expect(merged.map((d) => d.title)).toEqual([
      'Commit and Push',
      'Create PR (draft)',
      'Review changes',
      'Add unit tests',
    ]);
  });
});
