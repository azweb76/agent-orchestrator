import { describe, expect, it } from 'vitest';
import type { PullRequestChecks, PullRequestDetail } from '@agent-orchestrator/shared';
import { buildAgentPrStatusSummary } from './agentPrStatusSummary';

function basePr(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    owner: 'acme',
    repo: 'app',
    number: 7,
    title: 'Ship it',
    body: '',
    state: 'open',
    draft: false,
    merged: false,
    mergeable: true,
    mergeableState: 'clean',
    rebaseable: true,
    headRef: 'feat',
    baseRef: 'main',
    headSha: 'abc',
    baseSha: 'def',
    htmlUrl: 'https://github.com/acme/app/pull/7',
    author: null,
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commitCount: 1,
    commentCount: 0,
    reviewCommentCount: 0,
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    mergedAt: null,
    closedAt: null,
    mergeCommitSha: null,
    allowedMergeMethods: ['squash'],
    deleteBranchOnMerge: false,
    archived: false,
    workspaceId: null,
    agentId: null,
    ...overrides,
  };
}

function checks(overrides: Partial<PullRequestChecks> = {}): PullRequestChecks {
  return {
    headSha: 'abc',
    rollup: 'success',
    total: 3,
    passing: 3,
    failing: 0,
    pending: 0,
    neutral: 0,
    truncated: false,
    checks: [],
    ...overrides,
  };
}

describe('buildAgentPrStatusSummary', () => {
  it('labels checks and merge readiness for an open PR', () => {
    const model = buildAgentPrStatusSummary({ pr: basePr(), checks: checks() });
    expect(model.prStatus).toBe('open');
    expect(model.checksLabel).toBe('Checks passing (3/3)');
    expect(model.checksTone).toBe('success');
    expect(model.mergeLabel).toBe('Ready to merge');
    expect(model.mergeTone).toBe('success');
    expect(model.conflicted).toBe(false);
  });

  it('surfaces conflicts over checks tone', () => {
    const model = buildAgentPrStatusSummary({
      pr: basePr({ mergeable: false, mergeableState: 'dirty' }),
      checks: checks(),
    });
    expect(model.conflicted).toBe(true);
    expect(model.mergeLabel).toBe('Conflicts');
    expect(model.checksTone).toBe('error');
  });

  it('labels draft PRs without ready-to-merge', () => {
    const model = buildAgentPrStatusSummary({
      pr: basePr({ draft: true, mergeableState: 'draft' }),
    });
    expect(model.prStatus).toBe('draft');
    expect(model.mergeLabel).toBe('Draft');
  });
});
