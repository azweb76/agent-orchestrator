import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GitService } from './git.js';
import { getWorkspaceSyncStatus, pullWorkspaceDefaultBranch } from './workspace-sync.js';
import type { AppContext } from './app-context.js';

async function execGit(cwd: string, args: string[]): Promise<string> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function makeRemoteAndClone(): Promise<{
  tmp: string;
  remote: string;
  clone: string;
  seed: string;
  git: GitService;
}> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-sync-'));
  const remote = path.join(tmp, 'remote.git');
  const clone = path.join(tmp, 'clone');
  const seed = path.join(tmp, 'seed');

  await execGit(tmp, ['init', '--bare', remote]);
  await fs.mkdir(seed);
  await execGit(seed, ['init', '-b', 'main']);
  await execGit(seed, ['config', 'user.email', 'test@example.com']);
  await execGit(seed, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(seed, 'README.md'), 'one\n');
  await execGit(seed, ['add', 'README.md']);
  await execGit(seed, ['commit', '-m', 'one']);
  await execGit(seed, ['remote', 'add', 'origin', remote]);
  await execGit(seed, ['push', '-u', 'origin', 'main']);
  await execGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);

  const git = new GitService();
  await git.clone(remote, clone);
  return { tmp, remote, clone, seed, git };
}

function mockCtx(git: GitService, repoPath: string, defaultBranch = 'main'): AppContext {
  const workspace = {
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'file://repo',
    repoPath,
    defaultBranch,
    githubOwner: 'acme',
    githubRepo: 'demo',
    createdAt: new Date().toISOString(),
  };
  return {
    git,
    repos: {
      workspaces: {
        getById: () => workspace,
        updateDefaultBranch: (id: string, branch: string) => {
          assert.equal(id, 'ws-1');
          workspace.defaultBranch = branch;
        },
      },
    },
  } as unknown as AppContext;
}

test('getWorkspaceSyncStatus reports behind commits after remote advances', async () => {
  const { tmp, seed, clone, git } = await makeRemoteAndClone();
  try {
    await fs.writeFile(path.join(seed, 'README.md'), 'two\n');
    await execGit(seed, ['add', 'README.md']);
    await execGit(seed, ['commit', '-m', 'two']);
    await execGit(seed, ['push', 'origin', 'main']);

    const ctx = mockCtx(git, clone);
    const status = await getWorkspaceSyncStatus(ctx, 'ws-1');
    assert.equal(status.defaultBranch, 'main');
    assert.ok(status.behindBy >= 1);
    assert.equal(status.upToDate, false);
    assert.ok(status.remoteSha);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('pullWorkspaceDefaultBranch fast-forwards local default branch', async () => {
  const { tmp, seed, clone, git } = await makeRemoteAndClone();
  try {
    await fs.writeFile(path.join(seed, 'extra.txt'), 'x\n');
    await execGit(seed, ['add', 'extra.txt']);
    await execGit(seed, ['commit', '-m', 'extra']);
    await execGit(seed, ['push', 'origin', 'main']);

    const ctx = mockCtx(git, clone);
    const before = await getWorkspaceSyncStatus(ctx, 'ws-1');
    assert.ok(before.behindBy >= 1);

    const after = await pullWorkspaceDefaultBranch(ctx, 'ws-1');
    assert.equal(after.behindBy, 0);
    assert.equal(after.upToDate, true);
    assert.equal(after.localSha, after.remoteSha);

    const tip = await execGit(clone, ['rev-parse', 'main']);
    const remoteTip = await execGit(clone, ['rev-parse', 'origin/main']);
    assert.equal(tip, remoteTip);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
