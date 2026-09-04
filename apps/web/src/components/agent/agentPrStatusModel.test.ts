import { describe, expect, it } from 'vitest';
import type { PullRequestChecks, PullRequestDetail } from '@agent-orchestrator/shared';
import { buildAgentPrActionOffers, buildAgentPrStripModel } from './agentPrStatusModel';

function basePr(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    owner: 'acme',
    repo: 'app',
    number: 7,
    title: 'Ship it',
    body: '',
    state: 'open',
    draft: true,
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
    rollup: 'failure',
    total: 2,
    passing: 1,
    failing: 1,
    pending: 0,
    neutral: 0,
    truncated: false,
    checks: [],
    ...overrides,
  };
}

describe('buildAgentPrStripModel', () => {
  it('offers Fix CI when checks are failing on an open PR', () => {
    const model = buildAgentPrStripModel({
      pr: basePr({ draft: false, reviewCommentCount: 3 }),
      checks: checks(),
    });

    expect(model.stateLabel).toBe('Open');
    expect(model.prStatus).toBe('open');
    expect(model.showFixCi).toBe(true);
    expect(model.showAddressReview).toBe(true);
    expect(model.showOpenPr).toBe(true);
    expect(model.checksLabel).toBe('Checks failing (1/2)');
    expect(model.reviewLabel).toBe('3 review comments');
  });

  it('hides Address review in the menu when there are no review comments', () => {
    const model = buildAgentPrStripModel({
      pr: basePr({ draft: false, reviewCommentCount: 0 }),
      checks: checks({ rollup: 'success', failing: 0, passing: 2 }),
    });
    expect(model.showAddressReview).toBe(false);
  });

  it('hides mutating actions when archived or not open', () => {
    expect(
      buildAgentPrStripModel({
        pr: basePr(),
        checks: checks(),
        archived: true,
      }).showFixCi,
    ).toBe(false);

    expect(
      buildAgentPrStripModel({
        pr: basePr({ merged: true, state: 'closed' }),
        checks: checks(),
      }).showFixCi,
    ).toBe(false);
  });

  it('hides Open PR in the strip once the PR is merged', () => {
    const model = buildAgentPrStripModel({
      pr: basePr({ merged: true, state: 'closed', draft: false }),
      checks: checks({ rollup: 'success', failing: 0, passing: 2 }),
    });

    expect(model.prStatus).toBe('merged');
    expect(model.showOpenPr).toBe(false);
    expect(model.open).toBe(false);
  });

  it('surfaces conflicts and Resolve conflicts for dirty open PRs', () => {
    const model = buildAgentPrStripModel({
      pr: basePr({ draft: false, mergeable: false, mergeableState: 'dirty' }),
      checks: checks({ rollup: 'success', failing: 0, passing: 2 }),
    });

    expect(model.conflicted).toBe(true);
    expect(model.mergeHint).toBe('Conflicts with base');
    expect(model.showResolveConflicts).toBe(true);
    expect(model.showMarkReady).toBe(false);
    expect(model.checksTone).toBe('error');
  });

  it('surfaces conflicts on draft PRs that keep mergeable_state draft', () => {
    const model = buildAgentPrStripModel({
      pr: basePr({ draft: true, mergeable: false, mergeableState: 'draft' }),
      checks: checks({ rollup: 'success', failing: 0, passing: 2 }),
    });

    expect(model.conflicted).toBe(true);
    expect(model.showResolveConflicts).toBe(true);
    expect(model.showMarkReady).toBe(false);
    expect(model.mergeHint).toBe('Conflicts with base');
  });

  it('surfaces a mark-ready hint for green draft PRs', () => {
    const model = buildAgentPrStripModel({
      pr: basePr({ draft: true }),
      checks: checks({ rollup: 'success', failing: 0, passing: 2 }),
    });

    expect(model.stateLabel).toBe('Draft');
    expect(model.prStatus).toBe('draft');
    expect(model.showFixCi).toBe(false);
    expect(model.showResolveConflicts).toBe(false);
    expect(model.mergeHint).toBe('Mark ready when you are happy');
  });
});

describe('buildAgentPrActionOffers', () => {
  it('prioritizes Resolve conflicts over Fix CI when the branch is dirty', () => {
    const offers = buildAgentPrActionOffers({
      pr: basePr({ draft: false, mergeable: false, mergeableState: 'dirty', reviewCommentCount: 2 }),
      checks: checks(),
    });
    expect(offers).toHaveLength(1);
    expect(offers[0]?.kind).toBe('resolve_conflicts');
  });

  it('prioritizes Fix CI over review when checks are red', () => {
    const offers = buildAgentPrActionOffers({
      pr: basePr({ draft: false, reviewCommentCount: 2 }),
      checks: checks(),
    });
    expect(offers).toHaveLength(1);
    expect(offers[0]?.kind).toBe('fix_ci');
  });

  it('offers Address review when checks are green and comments exist', () => {
    const offers = buildAgentPrActionOffers({
      pr: basePr({ draft: false, reviewCommentCount: 2 }),
      checks: checks({ rollup: 'success', failing: 0, passing: 2 }),
    });
    expect(offers.map((item) => item.kind)).toEqual(['address_review']);
  });

  it('offers Mark ready for a green draft with no review backlog', () => {
    const offers = buildAgentPrActionOffers({
      pr: basePr({ draft: true, reviewCommentCount: 0 }),
      checks: checks({ rollup: 'success', failing: 0, passing: 2 }),
    });
    expect(offers.map((item) => item.kind)).toEqual(['mark_ready']);
  });

  it('skips Fix CI when a fix-ci session is already running', () => {
    const offers = buildAgentPrActionOffers({
      pr: basePr({ draft: false }),
      checks: checks(),
      sessions: [{ template: 'fix-ci', status: 'running' }],
    });
    expect(offers.some((item) => item.kind === 'fix_ci')).toBe(false);
  });

  it('skips Resolve conflicts when a resolve-conflicts session is already running', () => {
    const offers = buildAgentPrActionOffers({
      pr: basePr({ draft: false, mergeable: false, mergeableState: 'dirty' }),
      checks: checks({ rollup: 'success', failing: 0, passing: 2 }),
      sessions: [{ template: 'resolve-conflicts', status: 'running' }],
    });
    expect(offers.some((item) => item.kind === 'resolve_conflicts')).toBe(false);
  });
});
