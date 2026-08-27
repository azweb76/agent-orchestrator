import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import {
  commitAgentChanges,
  deleteAgent,
  deleteWorkspace,
  unarchiveAgent,
  type AppContext,
} from './app.js';
import type { ClaudeService, GitService } from './git.js';

describe('agent lifecycle: unarchive, delete, commit, workspace cleanup', () => {
  let dataDir: string;
  let ctx: AppContext;
  let commits: Array<{ path: string; message: string }>;
  let pushes: Array<{ path: string; branch: string }>;
  let removedWorktrees: string[];

  function seed(overrides?: { archivedAt?: string | null }): { agent: Agent; worktree: Worktree } {
    const workspace: Workspace = {
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/example/demo',
      repoPath: path.join(dataDir, 'repos', 'ws-1'),
      defaultBranch: 'main',
      githubOwner: 'example',
      githubRepo: 'demo',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    if (!ctx.repos.workspaces.getById(workspace.id)) {
      ctx.repos.workspaces.create(workspace);
      fs.mkdirSync(workspace.repoPath, { recursive: true });
      fs.writeFileSync(path.join(workspace.repoPath, 'README.md'), 'demo');
    }

    let worktree = ctx.repos.worktrees.getById('wt-1');
    if (!worktree) {
      worktree = {
        id: 'wt-1',
        workspaceId: workspace.id,
        name: 'feat',
        path: path.join(dataDir, 'worktrees', 'ws-1', 'feat'),
        branch: 'feat',
        prNumber: null,
        prTitle: null,
        baseBranch: 'main',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      ctx.repos.worktrees.create(worktree);
      fs.mkdirSync(worktree.path, { recursive: true });
    }

    const agent: Agent = {
      id: 'ag-1',
      worktreeId: worktree.id,
      name: 'Feat agent',
      status: overrides?.archivedAt ? 'archived' : 'idle',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'plan',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      activeSessionId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: overrides?.archivedAt ?? null,
    };
    ctx.repos.agents.create(agent);
    return { agent, worktree };
  }

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-life-'));
    commits = [];
    pushes = [];
    removedWorktrees = [];
    const db = initDatabase(dataDir);
    ctx = {
      repos: createRepositories(db),
      git: {
        removeWorktree: async (_repo: string, worktreePath: string) => {
          removedWorktrees.push(worktreePath);
        },
        getCurrentBranch: async () => 'feat',
        hasChanges: async () => true,
        commitAll: async (worktreePath: string, message: string) => {
          commits.push({ path: worktreePath, message });
        },
        pushBranch: async (worktreePath: string, branch: string) => {
          pushes.push({ path: worktreePath, branch });
        },
      } as unknown as GitService,
      github: {} as AppContext['github'],
      claude: { stop: () => true } as unknown as ClaudeService,
      anthropic: {} as AppContext['anthropic'],
      dataDir,
    };
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('unarchiveAgent restores an archived agent to idle', async () => {
    seed({ archivedAt: '2026-01-02T00:00:00.000Z' });
    const updated = await unarchiveAgent(ctx, 'ag-1');
    assert.equal(updated.archivedAt, null);
    assert.equal(updated.status, 'idle');
    assert.equal(ctx.repos.agents.getById('ag-1')?.archivedAt, null);
  });

  it('unarchiveAgent rejects agents that are not archived', async () => {
    seed();
    await assert.rejects(() => unarchiveAgent(ctx, 'ag-1'), /not archived/);
  });

  it('deleteAgent removes the agent and keeps the worktree by default', async () => {
    seed();
    const result = await deleteAgent(ctx, 'ag-1');
    assert.equal(result.deleted, true);
    assert.equal(result.deletedWorktree, false);
    assert.equal(ctx.repos.agents.getById('ag-1'), null);
    assert.ok(ctx.repos.worktrees.getById('wt-1'));
    assert.deepEqual(removedWorktrees, []);
  });

  it('deleteAgent can remove the worktree too', async () => {
    const { worktree } = seed();
    const result = await deleteAgent(ctx, 'ag-1', { deleteWorktree: true });
    assert.equal(result.deletedWorktree, true);
    assert.equal(ctx.repos.agents.getById('ag-1'), null);
    assert.equal(ctx.repos.worktrees.getById('wt-1'), null);
    assert.deepEqual(removedWorktrees, [worktree.path]);
  });

  it('commitAgentChanges commits local changes and pushes', async () => {
    seed();
    const result = await commitAgentChanges(ctx, 'ag-1', { message: 'fix: tests' });
    assert.equal(result.committed, true);
    assert.equal(result.pushed, true);
    assert.equal(result.branch, 'feat');
    assert.equal(commits.length, 1);
    assert.equal(commits[0]?.message, 'fix: tests');
    assert.deepEqual(pushes, [{ path: ctx.repos.worktrees.getById('wt-1')!.path, branch: 'feat' }]);
  });

  it('commitAgentChanges can skip push', async () => {
    seed();
    const result = await commitAgentChanges(ctx, 'ag-1', { message: 'wip', push: false });
    assert.equal(result.committed, true);
    assert.equal(result.pushed, false);
    assert.deepEqual(pushes, []);
  });

  it('deleteWorkspace removes clone files and worktree directories', async () => {
    seed();
    const repoPath = ctx.repos.workspaces.getById('ws-1')!.repoPath;
    const worktreeDir = path.join(dataDir, 'worktrees', 'ws-1');
    assert.equal(fs.existsSync(repoPath), true);

    await deleteWorkspace(ctx, 'ws-1');

    assert.equal(ctx.repos.workspaces.getById('ws-1'), null);
    assert.equal(ctx.repos.agents.getById('ag-1'), null);
    assert.equal(fs.existsSync(repoPath), false);
    assert.equal(fs.existsSync(worktreeDir), false);
  });
});
