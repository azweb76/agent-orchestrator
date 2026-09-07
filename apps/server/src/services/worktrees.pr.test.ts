import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { GitService } from './git.js';
import type { ClaudeService } from './git.js';
import { setupPrFetchFixture, execGit, assertSamePath } from './git.test-helpers.js';
import { createWorktreeFromPr } from './worktrees.js';

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
    github: {
      getPullRequest: async () => ({
        number: 33,
        title: 'PR title',
        state: 'open',
        headRef: 'pr-33',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/33',
        draft: false,
        authorLogin: 'dan',
        updatedAt: now,
      }),
    } as unknown as AppContext['github'],
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

test('createWorktreeFromPr resets an adopted worktree so leftovers from a previous agent do not leak into the new one', async () => {
  const { tmp, main } = await setupPrFetchFixture();
  const ctx = makeCtx(tmp, main);

  // First agent claims the PR worktree.
  const first = await createWorktreeFromPr(ctx, 'ws-1', { prNumber: 33 });

  // Simulate the previous occupant leaving uncommitted/untracked work behind.
  await fs.writeFile(`${first.worktree.path}/feature.txt`, 'leftover uncommitted edit\n');
  await fs.writeFile(`${first.worktree.path}/leftover.txt`, 'leftover untracked file\n');

  // Simulate a DB row removed independently of the git worktree (e.g. a DB reset
  // while data/worktrees/** persisted on disk) — the git worktree for pr-33 remains.
  ctx.repos.worktrees.delete(first.worktree.id);

  const second = await createWorktreeFromPr(ctx, 'ws-1', { prNumber: 33 });

  await assertSamePath(second.worktree.path, first.worktree.path);
  const status = await execGit(second.worktree.path, ['status', '--porcelain']);
  assert.doesNotMatch(status, /leftover/);
  const diff = await ctx.git.getDiff(second.worktree.path);
  assert.doesNotMatch(diff.patch, /leftover/);
  await assert.rejects(() => fs.access(`${second.worktree.path}/leftover.txt`));
  assert.equal(
    await fs.readFile(`${second.worktree.path}/feature.txt`, 'utf8'),
    'pr change\n',
  );

  await fs.rm(tmp, { recursive: true, force: true });
});
