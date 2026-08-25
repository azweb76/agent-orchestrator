import assert from 'node:assert/strict';
import test from 'node:test';
import type { Worktree } from '@agent-orchestrator/shared';
import { mergeLivePullRequest } from './pr-overlay.js';

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'pr-42-feature',
    path: '/tmp/wt',
    branch: 'pr-42',
    prNumber: 42,
    prTitle: 'Existing PR',
    baseBranch: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('mergeLivePullRequest preserves DB association when live lookup finds nothing', () => {
  const stored = worktree({ prNumber: 42, prTitle: 'Existing PR', branch: 'pr-42' });
  assert.deepEqual(mergeLivePullRequest(stored, null), stored);
});

test('mergeLivePullRequest overlays live PR details when a branch match is found', () => {
  const stored = worktree({ prNumber: null, prTitle: null, branch: 'feature/foo' });
  const merged = mergeLivePullRequest(stored, { number: 7, title: 'Live PR' });
  assert.equal(merged.prNumber, 7);
  assert.equal(merged.prTitle, 'Live PR');
  assert.equal(merged.branch, 'feature/foo');
});

test('mergeLivePullRequest updates title/number when live PR differs from stored', () => {
  const stored = worktree({ prNumber: 42, prTitle: 'Old title' });
  const merged = mergeLivePullRequest(stored, { number: 42, title: 'Renamed PR' });
  assert.equal(merged.prNumber, 42);
  assert.equal(merged.prTitle, 'Renamed PR');
});
