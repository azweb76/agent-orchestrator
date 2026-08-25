import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PullRequestCheck, PullRequestDetail, PullRequestMergeMethod } from '@agent-orchestrator/shared';
import { evaluateMergeReadiness, rollupChecks } from '@agent-orchestrator/shared';

function check(overrides: Partial<PullRequestCheck> = {}): PullRequestCheck {
  return {
    id: 'check_run:1',
    name: 'build',
    source: 'check_run',
    status: 'completed',
    conclusion: 'success',
    summary: null,
    detailsUrl: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function detail(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    owner: 'azweb76',
    repo: 'agent-orchestrator',
    number: 42,
    title: 'Add feature',
    body: '',
    state: 'open',
    draft: false,
    merged: false,
    mergeable: true,
    mergeableState: 'clean',
    rebaseable: true,
    headRef: 'feature/foo',
    baseRef: 'main',
    headSha: 'a'.repeat(40),
    baseSha: 'b'.repeat(40),
    htmlUrl: 'https://github.com/azweb76/agent-orchestrator/pull/42',
    author: null,
    additions: 10,
    deletions: 2,
    changedFiles: 3,
    commitCount: 1,
    commentCount: 0,
    reviewCommentCount: 0,
    labels: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    mergedAt: null,
    closedAt: null,
    mergeCommitSha: null,
    allowedMergeMethods: ['merge', 'squash', 'rebase'],
    deleteBranchOnMerge: false,
    workspaceId: null,
    agentId: null,
    ...overrides,
  };
}

test('rollupChecks reports none for an empty suite', () => {
  assert.equal(rollupChecks([]), 'none');
});

test('rollupChecks reports success when every check succeeded', () => {
  assert.equal(rollupChecks([check(), check({ id: 'check_run:2' })]), 'success');
});

test('rollupChecks reports pending while a check is queued or running', () => {
  assert.equal(rollupChecks([check(), check({ status: 'queued', conclusion: null })]), 'pending');
  assert.equal(rollupChecks([check({ status: 'in_progress', conclusion: null })]), 'pending');
});

test('rollupChecks lets failure win over a still-pending check', () => {
  const checks = [check({ status: 'in_progress', conclusion: null }), check({ conclusion: 'failure' })];
  assert.equal(rollupChecks(checks), 'failure');
});

test('rollupChecks treats every hard-failure conclusion as failure', () => {
  for (const conclusion of ['failure', 'timed_out', 'action_required', 'startup_failure']) {
    assert.equal(rollupChecks([check({ conclusion })]), 'failure', conclusion);
  }
});

test('rollupChecks reports neutral when nothing succeeded and nothing failed', () => {
  assert.equal(rollupChecks([check({ conclusion: 'skipped' }), check({ conclusion: 'neutral' })]), 'neutral');
});

test('evaluateMergeReadiness short-circuits on a merged pull request', () => {
  const readiness = evaluateMergeReadiness(detail({ merged: true, state: 'closed', mergeableState: 'unknown' }));

  assert.equal(readiness.canMerge, false);
  assert.equal(readiness.canUpdateBranch, false);
  assert.equal(readiness.computing, false);
  assert.deepEqual(readiness.allowedMethods, []);
  assert.match(readiness.reason, /merged/);
});

test('evaluateMergeReadiness short-circuits on a closed pull request', () => {
  const readiness = evaluateMergeReadiness(detail({ state: 'closed', mergeableState: 'unknown' }));

  assert.equal(readiness.canMerge, false);
  assert.equal(readiness.computing, false);
  assert.deepEqual(readiness.allowedMethods, []);
  assert.match(readiness.reason, /closed/);
});

test('evaluateMergeReadiness blocks a draft but still allows updating the branch', () => {
  const readiness = evaluateMergeReadiness(detail({ draft: true }));

  assert.equal(readiness.canMerge, false);
  assert.equal(readiness.canUpdateBranch, true);
  assert.match(readiness.reason, /Draft/);
});

test('evaluateMergeReadiness reports computing while mergeable is null', () => {
  const readiness = evaluateMergeReadiness(detail({ mergeable: null, mergeableState: 'unknown' }));

  assert.equal(readiness.computing, true);
  assert.equal(readiness.canMerge, false);
  assert.equal(readiness.canUpdateBranch, false);
});

test('evaluateMergeReadiness reports conflicts for a dirty branch', () => {
  const readiness = evaluateMergeReadiness(detail({ mergeable: false, mergeableState: 'dirty' }));

  assert.equal(readiness.conflicted, true);
  assert.equal(readiness.canMerge, false);
  assert.equal(readiness.canUpdateBranch, false);
  assert.equal(readiness.severity, 'error');
});

test('evaluateMergeReadiness allows updating the branch when merging is blocked', () => {
  const readiness = evaluateMergeReadiness(detail({ mergeable: true, mergeableState: 'blocked' }));

  assert.equal(readiness.canMerge, false);
  assert.equal(readiness.canUpdateBranch, true);
});

test('evaluateMergeReadiness enables update-branch when the branch is behind', () => {
  const readiness = evaluateMergeReadiness(detail({ mergeableState: 'behind' }));

  assert.equal(readiness.behind, true);
  assert.equal(readiness.canMerge, false);
  assert.equal(readiness.canUpdateBranch, true);
});

test('evaluateMergeReadiness allows an unstable merge but warns about checks', () => {
  const readiness = evaluateMergeReadiness(detail({ mergeableState: 'unstable' }));

  assert.equal(readiness.canMerge, true);
  assert.equal(readiness.canUpdateBranch, false);
  assert.match(readiness.warning ?? '', /checks/);
});

test('evaluateMergeReadiness allows a clean merge with no warning', () => {
  const readiness = evaluateMergeReadiness(detail());

  assert.equal(readiness.canMerge, true);
  assert.equal(readiness.warning, null);
  assert.equal(readiness.severity, 'success');
});

test('evaluateMergeReadiness drops rebase when GitHub says the PR is not rebaseable', () => {
  const readiness = evaluateMergeReadiness(detail({ rebaseable: false }));

  assert.deepEqual(readiness.allowedMethods, ['merge', 'squash']);
});

test('evaluateMergeReadiness intersects repo settings with rebaseability', () => {
  const allowed: PullRequestMergeMethod[] = ['squash', 'rebase'];
  const readiness = evaluateMergeReadiness(detail({ allowedMergeMethods: allowed, rebaseable: null }));

  assert.deepEqual(readiness.allowedMethods, ['squash']);
});
