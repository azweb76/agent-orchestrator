import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  listWorktreeDir,
  readWorktreeFile,
  WORKTREE_FILE_MAX_BYTES,
  WorktreeFileError,
} from './agents-files.js';
import { execGit } from './git.test-helpers.js';

async function fixture(): Promise<{ tmp: string; repo: string }> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-files-'));
  const repo = path.join(tmp, 'repo');
  await fs.mkdir(repo);
  await execGit(tmp, ['init', repo]);
  await execGit(repo, ['config', 'user.email', 'test@example.com']);
  await execGit(repo, ['config', 'user.name', 'Test']);
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'tracked.ts'), 'export const a = 1;\n');
  await execGit(repo, ['add', '.']);
  await execGit(repo, ['commit', '-m', 'initial']);
  await fs.writeFile(path.join(repo, 'untracked.md'), '# notes\n');
  return { tmp, repo };
}

async function rejectsWithStatus(
  promise: Promise<unknown>,
  status: number,
): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof WorktreeFileError);
    assert.equal(err.status, status);
    return true;
  });
}

test('readWorktreeFile reads tracked and untracked files', async () => {
  const { tmp, repo } = await fixture();

  const tracked = await readWorktreeFile(repo, 'src/tracked.ts');
  assert.deepEqual(tracked, {
    path: 'src/tracked.ts',
    content: 'export const a = 1;\n',
    size: 20,
    truncated: false,
    binary: false,
  });

  const untracked = await readWorktreeFile(repo, './untracked.md');
  assert.equal(untracked.path, 'untracked.md');
  assert.equal(untracked.content, '# notes\n');

  await fs.rm(tmp, { recursive: true, force: true });
});

test('readWorktreeFile rejects traversal, absolute, .git, and sensitive paths', async () => {
  const { tmp, repo } = await fixture();

  await rejectsWithStatus(readWorktreeFile(repo, '../outside.txt'), 400);
  await rejectsWithStatus(readWorktreeFile(repo, 'src/../../outside.txt'), 400);
  await rejectsWithStatus(readWorktreeFile(repo, '/etc/passwd'), 400);
  await rejectsWithStatus(readWorktreeFile(repo, '.git/config'), 403);
  await rejectsWithStatus(readWorktreeFile(repo, '.env'), 403);
  await rejectsWithStatus(readWorktreeFile(repo, 'config/prod.pem'), 403);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('readWorktreeFile reports missing files and directories as not found', async () => {
  const { tmp, repo } = await fixture();

  await rejectsWithStatus(readWorktreeFile(repo, 'src/gone.ts'), 404);
  await rejectsWithStatus(readWorktreeFile(repo, 'src'), 404);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('readWorktreeFile truncates past the byte cap without splitting a codepoint', async () => {
  const { tmp, repo } = await fixture();
  // "é" is two bytes, so the cap lands mid-codepoint for an odd-length prefix.
  const big = 'é'.repeat(WORKTREE_FILE_MAX_BYTES);
  await fs.writeFile(path.join(repo, 'big.txt'), big);

  const result = await readWorktreeFile(repo, 'big.txt');
  assert.equal(result.truncated, true);
  assert.equal(result.binary, false);
  assert.equal(result.size, WORKTREE_FILE_MAX_BYTES * 2);
  assert.equal(Buffer.byteLength(result.content, 'utf8'), WORKTREE_FILE_MAX_BYTES);
  assert.ok(!result.content.includes('�'));
  assert.equal(result.content, 'é'.repeat(WORKTREE_FILE_MAX_BYTES / 2));

  await fs.rm(tmp, { recursive: true, force: true });
});

test('readWorktreeFile flags binary files and returns no content', async () => {
  const { tmp, repo } = await fixture();
  await fs.writeFile(path.join(repo, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]));

  const result = await readWorktreeFile(repo, 'logo.png');
  assert.deepEqual(result, {
    path: 'logo.png',
    content: '',
    size: 5,
    truncated: false,
    binary: true,
  });

  await fs.rm(tmp, { recursive: true, force: true });
});

test('listWorktreeDir lists one level, folders first, hiding git and ignored paths', async () => {
  const { tmp, repo } = await fixture();
  await fs.writeFile(path.join(repo, '.gitignore'), 'ignored.log\nbuild/\n');
  await fs.writeFile(path.join(repo, 'ignored.log'), 'noise\n');
  await fs.mkdir(path.join(repo, 'build'));
  await fs.writeFile(path.join(repo, 'build', 'out.js'), '1\n');
  await fs.writeFile(path.join(repo, '.env'), 'SECRET=1\n');

  const root = await listWorktreeDir(repo, '');
  assert.deepEqual(root, [
    { name: 'src', path: 'src', type: 'dir' },
    { name: '.gitignore', path: '.gitignore', type: 'file' },
    { name: 'untracked.md', path: 'untracked.md', type: 'file' },
  ]);

  const nested = await listWorktreeDir(repo, './src');
  assert.deepEqual(nested, [{ name: 'tracked.ts', path: 'src/tracked.ts', type: 'file' }]);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('listWorktreeDir rejects escapes and missing directories', async () => {
  const { tmp, repo } = await fixture();

  await rejectsWithStatus(listWorktreeDir(repo, '..'), 400);
  await rejectsWithStatus(listWorktreeDir(repo, 'src/../../elsewhere'), 400);
  await rejectsWithStatus(listWorktreeDir(repo, '/etc'), 400);
  await rejectsWithStatus(listWorktreeDir(repo, '.git'), 403);
  await rejectsWithStatus(listWorktreeDir(repo, 'nope'), 404);
  // A file is not a directory listing.
  await rejectsWithStatus(listWorktreeDir(repo, 'untracked.md'), 404);

  await fs.rm(tmp, { recursive: true, force: true });
});
