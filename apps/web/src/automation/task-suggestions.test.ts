import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TASK_FOLLOWUPS,
  EXCESSIVE_ASSISTANT_TURNS,
  EXCESSIVE_USER_TURNS,
  buildStatusTaskSuggestionDrafts,
  describeExcessiveSessionUsage,
  filterApplicableTaskFollowUps,
  isSessionUsageExcessive,
  isTaskFollowUpApplicable,
  measureSessionUsage,
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
    expect(drafts.every((d) => d.description)).toBe(true);
  });

  it('offers Create PR even with a clean tree when no PR is linked', () => {
    const drafts = buildStatusTaskSuggestionDrafts({
      hasPendingChanges: false,
      hasBranchDiff: false,
      hasOpenPr: false,
    });
    expect(drafts.map((d) => d.title)).toEqual(['Create PR (draft)']);
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

  it('omits Review when the tree is clean and there is no branch diff', () => {
    expect(
      buildStatusTaskSuggestionDrafts({
        hasPendingChanges: false,
        hasBranchDiff: false,
        hasOpenPr: true,
        pr: null,
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

describe('isTaskFollowUpApplicable', () => {
  const byName = Object.fromEntries(BUILTIN_TASK_FOLLOWUPS.map((item) => [item.name, item]));

  it('keeps prompt kinds and filters status kinds from live signals', () => {
    const cleanNoPr = {
      hasPendingChanges: false,
      hasBranchDiff: false,
      hasOpenPr: false,
    };
    expect(isTaskFollowUpApplicable(byName.continue!, cleanNoPr)).toBe(true);
    expect(isTaskFollowUpApplicable(byName['grade-session']!, cleanNoPr)).toBe(true);
    expect(isTaskFollowUpApplicable(byName['commit-and-push']!, cleanNoPr)).toBe(false);
    expect(isTaskFollowUpApplicable(byName['create-draft-pr']!, cleanNoPr)).toBe(true);

    const dirty = {
      hasPendingChanges: true,
      hasBranchDiff: true,
      hasOpenPr: false,
    };
    expect(isTaskFollowUpApplicable(byName['commit-and-push']!, dirty)).toBe(true);

    const filtered = filterApplicableTaskFollowUps(
      [byName['commit-and-push']!, byName.continue!, byName['create-draft-pr']!],
      {
        hasPendingChanges: false,
        hasBranchDiff: false,
        hasOpenPr: true,
        pr: null,
      },
    );
    expect(filtered.map((item) => item.name)).toEqual(['continue']);
  });
});

describe('session usage efficiency heuristics', () => {
  it('measures turns, tokens, and cost from messages', () => {
    const usage = measureSessionUsage([
      { role: 'user', content: 'a'.repeat(40) },
      {
        role: 'assistant',
        content: 'b'.repeat(40),
        metadata: {
          costUsd: 0.12,
          timeline: [{ type: 'text', text: 'c'.repeat(40) }],
        },
      },
    ]);
    expect(usage.userTurns).toBe(1);
    expect(usage.assistantTurns).toBe(1);
    expect(usage.estimatedTokens).toBe(30);
    expect(usage.costUsd).toBe(0.12);
  });

  it('flags excessive turns and describes why', () => {
    expect(
      isSessionUsageExcessive({
        userTurns: EXCESSIVE_USER_TURNS,
        assistantTurns: EXCESSIVE_ASSISTANT_TURNS,
        estimatedTokens: 10,
        costUsd: null,
      }),
    ).toBe(true);
    const detail = describeExcessiveSessionUsage({
      userTurns: EXCESSIVE_USER_TURNS,
      assistantTurns: 1,
      estimatedTokens: 10,
      costUsd: null,
    });
    expect(detail).toMatch(/turns/);
  });

  it('includes a built-in grade-session follow-up', () => {
    const grade = BUILTIN_TASK_FOLLOWUPS.find((item) => item.name === 'grade-session');
    expect(grade?.kind).toBe('grade-session');
  });
});
