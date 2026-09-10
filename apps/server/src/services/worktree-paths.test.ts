import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { resolveWorktreeName, worktreePathFor } from './worktree-paths.js';

test('resolveWorktreeName slugifies the caller-supplied name', () => {
  assert.equal(resolveWorktreeName('../../escape', 'branch'), 'escape');
  assert.equal(resolveWorktreeName('My Feature', 'branch'), 'my-feature');
  assert.equal(resolveWorktreeName('a\\b', 'branch'), 'a-b');
});

test('resolveWorktreeName falls back when the request slugifies to nothing', () => {
  assert.equal(resolveWorktreeName('...', 'feature/thing'), 'feature-thing');
  assert.equal(resolveWorktreeName('', 'feature/thing'), 'feature-thing');
  assert.equal(resolveWorktreeName(undefined, 'feature/thing'), 'feature-thing');
});

test('resolveWorktreeName refuses when neither value yields a slug', () => {
  assert.throws(() => resolveWorktreeName('...', '///'), /Could not derive a worktree name/);
});

test('a resolved name never contains a separator or traversal', () => {
  for (const input of ['../../etc/passwd', '..', '../sibling', '/absolute/path']) {
    const name = resolveWorktreeName(input, 'fallback');
    assert.equal(name.includes('/'), false, input);
    assert.equal(name.includes('\\'), false, input);
    assert.equal(name.includes('..'), false, input);
  }
});

test('worktreePathFor keeps the result under the workspace root', () => {
  assert.equal(
    worktreePathFor('/data', 'ws1', 'feature-x'),
    path.resolve('/data/worktrees/ws1/feature-x'),
  );
});

test('worktreePathFor rejects traversal, an empty name, and dot', () => {
  for (const name of ['..', '../..', '../other', '', '.']) {
    assert.throws(() => worktreePathFor('/data', 'ws1', name), /Invalid worktree name/, name);
  }
});

test('worktreePathFor rejects an absolute name', () => {
  assert.throws(() => worktreePathFor('/data', 'ws1', '/etc'), /Invalid worktree name/);
});

test('a traversing request body cannot escape the workspace root end to end', () => {
  const root = path.resolve('/data/worktrees/ws1');
  const name = resolveWorktreeName('../../../../tmp/pwned', 'fallback');
  const resolved = worktreePathFor('/data', 'ws1', name);
  assert.equal(resolved.startsWith(root + path.sep), true);
});
