import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Workspace } from '@agent-orchestrator/shared';
import { ensureUniqueBranchName, resolveExplicitBranchName } from './branch-name.js';
import { GitService } from './git.js';
import { execGit } from './git.test-helpers.js';
import type { AppContext } from './app-context.js';

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

async function setupRepoFixture(): Promise<{ tmp: string; main: string }> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-unique-branch-'));
  const origin = path.join(tmp, 'origin.git');
  const main = path.join(tmp, 'main');

  await execGit(tmp, ['init', '--bare', origin]);
  await execGit(tmp, ['clone', origin, main]);
  await execGit(main, ['config', 'user.email', 'test@example.com']);
  await execGit(main, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(main, 'README.md'), 'main\n');
  await execGit(main, ['add', 'README.md']);
  await execGit(main, ['commit', '-m', 'initial']);
  return { tmp, main };
}

function makeCtx(repoPath: string): AppContext {
  return {
    repos: {} as AppContext['repos'],
    git: new GitService(),
    github: {} as AppContext['github'],
    jira: {} as AppContext['jira'],
    claude: {} as AppContext['claude'],
    anthropic: {} as AppContext['anthropic'],
    dataDir: repoPath,
  };
}

function makeWorkspace(repoPath: string): Workspace {
  return {
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo.git',
    repoPath,
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: new Date().toISOString(),
  };
}

test('ensureUniqueBranchName returns the candidate unchanged when free', async () => {
  const { tmp, main } = await setupRepoFixture();
  const ctx = makeCtx(main);
  const workspace = makeWorkspace(main);

  assert.equal(await ensureUniqueBranchName(ctx, workspace, 'feat/new-thing'), 'feat/new-thing');

  await fs.rm(tmp, { recursive: true, force: true });
});

test('ensureUniqueBranchName appends -2 when the candidate exists', async () => {
  const { tmp, main } = await setupRepoFixture();
  const ctx = makeCtx(main);
  const workspace = makeWorkspace(main);
  await execGit(main, ['branch', 'feat/dup']);

  assert.equal(await ensureUniqueBranchName(ctx, workspace, 'feat/dup'), 'feat/dup-2');

  await fs.rm(tmp, { recursive: true, force: true });
});

test('ensureUniqueBranchName skips over taken suffixes to find a free one', async () => {
  const { tmp, main } = await setupRepoFixture();
  const ctx = makeCtx(main);
  const workspace = makeWorkspace(main);
  await execGit(main, ['branch', 'feat/dup']);
  await execGit(main, ['branch', 'feat/dup-2']);
  await execGit(main, ['branch', 'feat/dup-3']);

  assert.equal(await ensureUniqueBranchName(ctx, workspace, 'feat/dup'), 'feat/dup-4');

  await fs.rm(tmp, { recursive: true, force: true });
});
