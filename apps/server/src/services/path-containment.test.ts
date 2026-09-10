import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isContained, isRealPathContained, isSymlink } from './path-containment.js';

async function tmpTree(): Promise<{ root: string; outside: string; cleanup: () => Promise<void> }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-contain-'));
  const root = path.join(base, 'worktree');
  const outside = path.join(base, 'outside');
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  return { root, outside, cleanup: () => fs.rm(base, { recursive: true, force: true }) };
}

test('isContained is lexical and includes the root itself', () => {
  assert.equal(isContained('/a/b', '/a/b'), true);
  assert.equal(isContained('/a/b', '/a/b/c'), true);
  assert.equal(isContained('/a/b', '/a/bc'), false);
  assert.equal(isContained('/a/b', '/a'), false);
});

test('a symlink pointing outside the root is not contained', async () => {
  const { root, outside, cleanup } = await tmpTree();
  try {
    const secret = path.join(outside, 'credentials');
    await fs.writeFile(secret, 'token');
    // Innocuously named, so the sensitive-basename filter would not catch it.
    const link = path.join(root, 'notes.md');
    await fs.symlink(secret, link);

    assert.equal(await isSymlink(link), true);
    assert.equal(await isRealPathContained(root, link), false);
  } finally {
    await cleanup();
  }
});

test('a symlink pointing inside the root stays contained', async () => {
  const { root, cleanup } = await tmpTree();
  try {
    const real = path.join(root, 'real.md');
    await fs.writeFile(real, 'hello');
    const link = path.join(root, 'alias.md');
    await fs.symlink(real, link);
    assert.equal(await isRealPathContained(root, link), true);
  } finally {
    await cleanup();
  }
});

test('a symlinked directory escaping the root is not contained', async () => {
  const { root, outside, cleanup } = await tmpTree();
  try {
    const linkedDir = path.join(root, '.claude');
    await fs.symlink(outside, linkedDir);
    // A not-yet-created file underneath the symlinked directory.
    const target = path.join(linkedDir, 'skills', 'x', 'SKILL.md');
    assert.equal(await isRealPathContained(root, target), false);
  } finally {
    await cleanup();
  }
});

test('a not-yet-created file inside the root is contained', async () => {
  const { root, cleanup } = await tmpTree();
  try {
    const target = path.join(root, '.claude', 'skills', 'new', 'SKILL.md');
    assert.equal(await isRealPathContained(root, target), true);
  } finally {
    await cleanup();
  }
});

test('a plain traversal is not contained', async () => {
  const { root, cleanup } = await tmpTree();
  try {
    assert.equal(await isRealPathContained(root, path.join(root, '..', 'outside')), false);
  } finally {
    await cleanup();
  }
});

test('isSymlink is false for a regular file and a missing path', async () => {
  const { root, cleanup } = await tmpTree();
  try {
    const real = path.join(root, 'plain.md');
    await fs.writeFile(real, 'x');
    assert.equal(await isSymlink(real), false);
    assert.equal(await isSymlink(path.join(root, 'nope.md')), false);
  } finally {
    await cleanup();
  }
});
