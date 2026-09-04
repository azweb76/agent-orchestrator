import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExplicitBranchName } from './branch-name.js';

test('resolveExplicitBranchName treats missing, empty, and Auto as suggest', () => {
  assert.equal(resolveExplicitBranchName(undefined), null);
  assert.equal(resolveExplicitBranchName(null), null);
  assert.equal(resolveExplicitBranchName(''), null);
  assert.equal(resolveExplicitBranchName('   '), null);
  assert.equal(resolveExplicitBranchName('Auto'), null);
  assert.equal(resolveExplicitBranchName('auto'), null);
  assert.equal(resolveExplicitBranchName(' AUTO '), null);
});

test('resolveExplicitBranchName sanitizes an explicit branch name', () => {
  assert.equal(resolveExplicitBranchName('feature/My Change'), 'feature/my-change');
  assert.equal(resolveExplicitBranchName('  Fix Login  '), 'fix-login');
});
