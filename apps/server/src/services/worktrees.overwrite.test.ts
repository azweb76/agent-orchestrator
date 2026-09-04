import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BRANCH_EXISTS_ERROR_CODE } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { BranchExistsError } from './git-errors.js';
import { ClaudeService, GitService } from './git.js';
import { createWorktreeFromBranch } from './worktrees.js';
import { execGit } from './git.test-helpers.js';

async function setupRepoFixture(): Promise<{
  tmp: string;
  origin: string;
  main: string;
  mainTip: string;
}> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-branch-overwrite-'));
  const origin = path.join(tmp, 'origin.git');
  const main = path.join(tmp, 'main');

  await execGit(tmp, ['init', '--bare', origin]);
  await execGit(tmp, ['clone', origin, main]);
  await execGit(main, ['config', 'user.email', 'test@example.com']);
  await execGit(main, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(main, 'README.md'), 'main\n');
  await execGit(main, ['add', 'README.md']);
  await execGit(main, ['commit', '-m', 'initial']);
  const current = await execGit(main, ['branch', '--show-current']);
  if (current !== 'main') {
    await execGit(main, ['branch', '-M', 'main']);
  }
  await execGit(main, ['push', '-u', 'origin', 'main']);
  const mainTip = await execGit(main, ['rev-parse', 'HEAD']);
  return { tmp, origin, main, mainTip };
}

function makeCtx(tmp: string, repoPath: string): AppContext {
  const db = initDatabase(tmp);
  const workspaceId = 'ws-1';
  const now = new Date().toISOString();
  const repos = createRepositories(db);
  repos.workspaces.create({
    id: workspaceId,
    name: 'demo',
    repoUrl: 'https://github.com/example/demo.git',
    repoPath,
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: now,
  });
  return {
    repos,
    git: new GitService(),
    github: {} as AppContext['github'],
    jira: {} as AppContext['jira'],
    claude: {
      stop: () => true,
      getBin: () => 'claude',
      checkInstalled: async () => false,
      releaseAll: () => undefined,
    } as unknown as ClaudeService,
    anthropic: {} as AppContext['anthropic'],
    dataDir: tmp,
  };
}

test('localBranchExists reports heads refs', async () => {
  const { tmp, main } = await setupRepoFixture();
  const git = new GitService();
  assert.equal(await git.localBranchExists(main, 'main'), true);
  assert.equal(await git.localBranchExists(main, 'missing'), false);
  await fs.rm(tmp, { recursive: true, force: true });
});

test('createWorktreeFromBranch createNew rejects an existing local branch', async () => {
  const { tmp, main } = await setupRepoFixture();
  const ctx = makeCtx(tmp, main);
  await execGit(main, ['branch', 'feat/dup']);

  await assert.rejects(
    () =>
      createWorktreeFromBranch(ctx, 'ws-1', {
        branch: 'feat/dup',
        createNew: true,
        baseBranch: 'main',
      }),
    (err: unknown) => {
      assert.ok(err instanceof BranchExistsError);
      assert.equal(err.code, BRANCH_EXISTS_ERROR_CODE);
      assert.equal(err.branch, 'feat/dup');
      assert.equal(err.status, 409);
      return true;
    },
  );

  await fs.rm(tmp, { recursive: true, force: true });
});

test('createWorktreeFromBranch overwrite resets the branch and replaces the worktree', async () => {
  const { tmp, main, mainTip } = await setupRepoFixture();
  const ctx = makeCtx(tmp, main);

  const first = await createWorktreeFromBranch(ctx, 'ws-1', {
    branch: 'feat/reuse',
    createNew: true,
    baseBranch: 'main',
  });
  await fs.writeFile(path.join(first.worktree.path, 'stale.txt'), 'old work\n');
  await execGit(first.worktree.path, ['add', 'stale.txt']);
  await execGit(first.worktree.path, ['commit', '-m', 'stale commit']);
  const staleTip = await execGit(first.worktree.path, ['rev-parse', 'HEAD']);
  assert.notEqual(staleTip, mainTip);

  const second = await createWorktreeFromBranch(ctx, 'ws-1', {
    branch: 'feat/reuse',
    createNew: true,
    baseBranch: 'main',
    overwrite: true,
  });

  assert.notEqual(second.worktree.id, first.worktree.id);
  assert.equal(ctx.repos.worktrees.getById(first.worktree.id), null);
  assert.equal(ctx.repos.agents.getById(first.agent.id), null);
  assert.equal(await execGit(second.worktree.path, ['rev-parse', 'HEAD']), mainTip);
  assert.equal(await execGit(second.worktree.path, ['branch', '--show-current']), 'feat/reuse');
  await assert.rejects(() => fs.access(path.join(second.worktree.path, 'stale.txt')));

  await fs.rm(tmp, { recursive: true, force: true });
});
