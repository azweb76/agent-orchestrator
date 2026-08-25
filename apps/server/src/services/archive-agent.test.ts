import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { archiveAgent, listSidebarTree, type AppContext } from './app.js';
import type { ClaudeService, GitService } from './git.js';

describe('archiveAgent', () => {
  let dataDir: string;
  let ctx: AppContext;
  let removedWorktrees: string[];

  function seed(): { workspace: Workspace; worktree: Worktree; agent: Agent } {
    const workspace: Workspace = {
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/example/demo',
      repoPath: path.join(dataDir, 'demo'),
      defaultBranch: 'main',
      githubOwner: 'example',
      githubRepo: 'demo',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    ctx.repos.workspaces.create(workspace);

    const worktree: Worktree = {
      id: 'wt-1',
      workspaceId: workspace.id,
      name: 'feat-branch',
      path: path.join(dataDir, 'wt'),
      branch: 'feat',
      prNumber: null,
      prTitle: null,
      baseBranch: 'main',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    ctx.repos.worktrees.create(worktree);

    const agent: Agent = {
      id: 'ag-1',
      worktreeId: worktree.id,
      name: 'Feat agent',
      status: 'idle',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'plan',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
    };
    ctx.repos.agents.create(agent);

    return { workspace, worktree, agent };
  }

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-archive-'));
    removedWorktrees = [];
    const db = initDatabase(dataDir);
    ctx = {
      repos: createRepositories(db),
      git: {
        removeWorktree: async (_repoPath: string, worktreePath: string) => {
          removedWorktrees.push(worktreePath);
        },
      } as unknown as GitService,
      github: {} as AppContext['github'],
      claude: {
        stop: () => true,
      } as unknown as ClaudeService,
      anthropic: {} as AppContext['anthropic'],
      dataDir,
    };
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('archives the agent and keeps the worktree by default', async () => {
    seed();
    const result = await archiveAgent(ctx, 'ag-1');

    assert.equal(result.deletedWorktree, false);
    assert.ok(result.agent);
    assert.equal(result.agent.status, 'archived');
    assert.ok(result.agent.archivedAt);
    assert.equal(ctx.repos.agents.getById('ag-1')?.status, 'archived');
    assert.ok(ctx.repos.worktrees.getById('wt-1'));
    assert.deepEqual(removedWorktrees, []);

    const sidebar = await listSidebarTree(ctx);
    assert.equal(sidebar[0]?.agents.length, 0);
  });

  it('deletes the worktree and agent when deleteWorktree is set', async () => {
    const { worktree } = seed();
    const result = await archiveAgent(ctx, 'ag-1', { deleteWorktree: true });

    assert.equal(result.deletedWorktree, true);
    assert.equal(result.agent, null);
    assert.equal(ctx.repos.agents.getById('ag-1'), null);
    assert.equal(ctx.repos.worktrees.getById('wt-1'), null);
    assert.deepEqual(removedWorktrees, [worktree.path]);
  });
});
