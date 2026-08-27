import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GitService } from './git.js';
import {
  CHAT_MENTION_MAX_FILE_BYTES,
  CHAT_MENTION_MAX_TOTAL_BYTES,
  isSensitiveMentionPath,
  resolveChatMentions,
  resolveWorktreeFilePath,
} from './chat-mentions.js';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', cwd, ...args], { maxBuffer: 10 * 1024 * 1024 });
}

test('resolveWorktreeFilePath rejects path escape', () => {
  const root = '/tmp/worktree';
  assert.equal(resolveWorktreeFilePath(root, '../secret.txt'), null);
  assert.equal(resolveWorktreeFilePath(root, '/etc/passwd'), null);
  assert.equal(resolveWorktreeFilePath(root, 'src/app.ts'), path.resolve(root, 'src/app.ts'));
});

test('isSensitiveMentionPath skips env and key material', () => {
  assert.equal(isSensitiveMentionPath('.env'), true);
  assert.equal(isSensitiveMentionPath('.env.local'), true);
  assert.equal(isSensitiveMentionPath('certs/server.pem'), true);
  assert.equal(isSensitiveMentionPath('config/secrets.json'), true);
  assert.equal(isSensitiveMentionPath('src/index.ts'), false);
});

test('resolveChatMentions attaches file contents and notes missing files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-mentions-'));
  const git = new GitService();
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'app.ts'), 'export const app = 1;\n');
  await fs.writeFile(path.join(root, '.env'), 'SECRET=1\n');

  const result = await resolveChatMentions(git, root, [
    { kind: 'file', path: 'src/app.ts' },
    { kind: 'file', path: 'missing.ts' },
    { kind: 'file', path: '.env' },
  ]);

  assert.match(result.context, /### @src\/app\.ts/);
  assert.match(result.context, /export const app = 1;/);
  assert.match(result.context, /### Mention notes/);
  assert.ok(result.notes.some((note) => note.note.includes('file not found')));
  assert.ok(result.notes.some((note) => note.note.includes('sensitive file')));

  await fs.rm(root, { recursive: true, force: true });
});

test('resolveChatMentions caps oversized files and total budget', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-mentions-cap-'));
  const git = new GitService();
  const big = 'x'.repeat(CHAT_MENTION_MAX_FILE_BYTES + 50);
  await fs.writeFile(path.join(root, 'big.txt'), big);
  await fs.writeFile(path.join(root, 'small.txt'), 'ok');

  const skipped = await resolveChatMentions(git, root, [{ kind: 'file', path: 'big.txt' }]);
  assert.doesNotMatch(skipped.context, /x{100}/);
  assert.ok(skipped.notes.some((note) => note.note.includes('too large')));

  const many = Array.from({ length: 15 }, (_, index) => ({
    kind: 'file' as const,
    path: `file-${index}.txt`,
  }));
  const chunk = 'x'.repeat(50_000);
  for (const item of many) {
    await fs.writeFile(path.join(root, item.path), chunk);
  }
  const capped = await resolveChatMentions(git, root, many);
  assert.ok(Buffer.byteLength(capped.context, 'utf8') <= CHAT_MENTION_MAX_TOTAL_BYTES + 2_000);
  assert.ok(capped.notes.some((note) => note.note.includes('mention budget')));

  await fs.rm(root, { recursive: true, force: true });
});

test('resolveChatMentions includes pending diff via git helper', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-mentions-diff-'));
  const root = path.join(tmp, 'repo');
  await fs.mkdir(root);
  await execGit(tmp, ['init', root]);
  await execGit(root, ['config', 'user.email', 'test@example.com']);
  await execGit(root, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(root, 'README.md'), '# hello\n');
  await execGit(root, ['add', 'README.md']);
  await execGit(root, ['commit', '-m', 'initial']);
  await fs.writeFile(path.join(root, 'README.md'), '# hello\n# change\n');

  const git = new GitService();
  const result = await resolveChatMentions(git, root, [{ kind: 'diff' }]);
  assert.match(result.context, /### @diff/);
  assert.match(result.context, /README\.md/);

  await fs.rm(tmp, { recursive: true, force: true });
});
