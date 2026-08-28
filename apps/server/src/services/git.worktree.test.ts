import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GitService } from './git.js';
import {
  assertSamePath,
  execGit,
  setupPrFetchFixture,
} from './git.test-helpers.js';

test('getDiff pending includes unstaged and untracked files; base ref shows branch commits', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-diff-'));
  const repo = path.join(tmp, 'repo');
  await fs.mkdir(repo);
  await execGit(tmp, ['init', repo]);
  await execGit(repo, ['config', 'user.email', 'test@example.com']);
  await execGit(repo, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(repo, 'README.md'), 'main\n');
  await execGit(repo, ['add', 'README.md']);
  await execGit(repo, ['commit', '-m', 'initial']);
  const current = await execGit(repo, ['branch', '--show-current']);
  if (current !== 'main') {
    await execGit(repo, ['branch', '-M', 'main']);
  }

  await execGit(repo, ['checkout', '-b', 'feature']);
  await fs.writeFile(path.join(repo, 'committed.txt'), 'on branch\n');
  await execGit(repo, ['add', 'committed.txt']);
  await execGit(repo, ['commit', '-m', 'branch commit']);

  await fs.writeFile(path.join(repo, 'README.md'), 'main\npending edit\n');
  await fs.writeFile(path.join(repo, 'new-file.txt'), 'untracked\n');

  const git = new GitService();
  const pending = await git.getDiff(repo);
  assert.match(pending.patch, /pending edit/);
  assert.match(pending.patch, /new-file\.txt/);
  assert.doesNotMatch(pending.patch, /on branch/);

  const vsMain = await git.getDiff(repo, 'main');
  assert.match(vsMain.patch, /committed\.txt/);
  assert.match(vsMain.patch, /pending edit/);
  // Untracked files are only included for pending (HEAD) diffs.
  assert.doesNotMatch(vsMain.patch, /new-file\.txt/);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('fetchPullRequest creates local branch when not checked out', async () => {
  const { tmp, main, prCommit } = await setupPrFetchFixture();
  const git = new GitService();

  await git.fetchPullRequest(main, 33, 'pr-33');

  const tip = await execGit(main, ['rev-parse', 'pr-33']);
  assert.equal(tip, prCommit);
  assert.equal(await execGit(main, ['rev-parse', 'refs/pull/33/head']), prCommit);
  assert.equal(await git.getWorktreePathForBranch(main, 'pr-33'), null);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('fetchPullRequest keeps the PR tip across a second fetch when prune is enabled', async () => {
  const { tmp, main, prCommit } = await setupPrFetchFixture();
  const git = new GitService();
  await execGit(main, ['config', 'remote.origin.prune', 'true']);

  await git.fetchPullRequest(main, 33, 'pr-33');
  // Used to throw: not a valid object name: 'refs/remotes/pull/33/head'
  await git.fetchPullRequest(main, 33, 'pr-33');

  assert.equal(await execGit(main, ['rev-parse', 'pr-33']), prCommit);
  assert.equal(await execGit(main, ['rev-parse', 'refs/pull/33/head']), prCommit);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('fetchPullRequest succeeds when local PR branch is already checked out in a worktree', async () => {
  const { tmp, main, origin, prCommit } = await setupPrFetchFixture();
  const git = new GitService();
  const worktreePath = path.join(tmp, 'pr-33-update-node');

  // First fetch + worktree — the real-world state that triggered the bug
  await git.fetchPullRequest(main, 33, 'pr-33');
  await git.addWorktree(main, worktreePath, 'pr-33');
  await assertSamePath(await git.getWorktreePathForBranch(main, 'pr-33'), worktreePath);

  // Advance the remote PR head so a direct fetch into refs/heads/pr-33 would refuse
  const updater = path.join(tmp, 'updater');
  await execGit(tmp, ['clone', origin, updater]);
  await execGit(updater, ['config', 'user.email', 'test@example.com']);
  await execGit(updater, ['config', 'user.name', 'Test']);
  await execGit(updater, ['fetch', 'origin', 'pull/33/head']);
  await execGit(updater, ['checkout', '-B', 'pr-head', 'FETCH_HEAD']);
  await fs.writeFile(path.join(updater, 'feature.txt'), 'pr change v2\n');
  await execGit(updater, ['add', 'feature.txt']);
  await execGit(updater, ['commit', '-m', 'pr commit v2']);
  const newerCommit = await execGit(updater, ['rev-parse', 'HEAD']);
  await execGit(updater, ['push', 'origin', 'pr-head']);
  await execGit(origin, ['update-ref', 'refs/pull/33/head', newerCommit]);

  // This used to throw: refusing to fetch into branch 'refs/heads/pr-33' checked out at ...
  await assert.doesNotReject(() => git.fetchPullRequest(main, 33, 'pr-33'));

  await assertSamePath(await git.getWorktreePathForBranch(main, 'pr-33'), worktreePath);
  // Local checked-out tip is left alone; local PR ref is updated
  assert.equal(await execGit(worktreePath, ['rev-parse', 'pr-33']), prCommit);
  assert.equal(await execGit(main, ['rev-parse', 'refs/pull/33/head']), newerCommit);

  await fs.rm(tmp, { recursive: true, force: true });
});
