import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GitService } from './git.js';
import { normalizeWorktreeRelPath, restoreWorktreePaths } from './git-restore.js';
import { execGit } from './git.test-helpers.js';

test('normalizeWorktreeRelPath accepts relative files and rejects traversal', () => {
  assert.equal(normalizeWorktreeRelPath('./src/app.ts'), 'src/app.ts');
  assert.equal(normalizeWorktreeRelPath('src\\app.ts'), 'src/app.ts');
  assert.throws(() => normalizeWorktreeRelPath(''), /required/);
  assert.throws(() => normalizeWorktreeRelPath('../secret'), /Invalid file path/);
  assert.throws(() => normalizeWorktreeRelPath('/etc/passwd'), /Invalid file path/);
  assert.throws(() => normalizeWorktreeRelPath('.git/config'), /Cannot undo \.git/);
  assert.throws(() => normalizeWorktreeRelPath('foo/../../bar'), /Invalid file path/);
});

test('restoreWorktreePaths restores tracked edits, deletions, and untracked files', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-restore-'));
  const repo = path.join(tmp, 'repo');
  await fs.mkdir(repo);
  await execGit(tmp, ['init', repo]);
  await execGit(repo, ['config', 'user.email', 'test@example.com']);
  await execGit(repo, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(repo, 'keep.txt'), 'keep\n');
  await fs.writeFile(path.join(repo, 'edit.txt'), 'original\n');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'gone.txt'), 'delete me\n');
  await execGit(repo, ['add', '.']);
  await execGit(repo, ['commit', '-m', 'initial']);

  await fs.writeFile(path.join(repo, 'edit.txt'), 'changed\n');
  await fs.rm(path.join(repo, 'src', 'gone.txt'));
  await fs.writeFile(path.join(repo, 'src', 'new.txt'), 'untracked\n');
  await fs.writeFile(path.join(repo, 'keep.txt'), 'leave this dirty\n');

  const git = new GitService();
  const restored = await git.restoreWorktreePaths(repo, [
    'edit.txt',
    'src/gone.txt',
    'src/new.txt',
    './edit.txt',
  ]);
  assert.deepEqual(restored, ['edit.txt', 'src/gone.txt', 'src/new.txt']);

  assert.equal(await fs.readFile(path.join(repo, 'edit.txt'), 'utf8'), 'original\n');
  assert.equal(await fs.readFile(path.join(repo, 'src', 'gone.txt'), 'utf8'), 'delete me\n');
  await assert.rejects(() => fs.access(path.join(repo, 'src', 'new.txt')));
  assert.equal(await fs.readFile(path.join(repo, 'keep.txt'), 'utf8'), 'leave this dirty\n');

  await fs.rm(tmp, { recursive: true, force: true });
});

test('restoreWorktreePaths unstages and deletes a staged new file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-restore-staged-'));
  const repo = path.join(tmp, 'repo');
  await fs.mkdir(repo);
  await execGit(tmp, ['init', repo]);
  await execGit(repo, ['config', 'user.email', 'test@example.com']);
  await execGit(repo, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(repo, 'README.md'), 'hi\n');
  await execGit(repo, ['add', 'README.md']);
  await execGit(repo, ['commit', '-m', 'initial']);

  await fs.writeFile(path.join(repo, 'added.ts'), 'export {}\n');
  await execGit(repo, ['add', 'added.ts']);

  await restoreWorktreePaths(repo, ['added.ts']);
  await assert.rejects(() => fs.access(path.join(repo, 'added.ts')));
  assert.equal(await execGit(repo, ['status', '--porcelain']), '');

  await fs.rm(tmp, { recursive: true, force: true });
});
