import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { Notifier } from './notifier.js';
import { listMergedFleetAgents } from './fleet-bulk.js';

function makeCtx(tmp: string, github: GitHubService): AppContext {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  return {
    repos,
    git: new GitService(),
    github,
    claude: new ClaudeService('claude', path.join(tmp, 'runs')),
    anthropic: {} as AnthropicService,
    dataDir: tmp,
    notifier: new Notifier(),
  };
}

test('listMergedFleetAgents returns active agents on merged pull requests', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-fleet-'));
  try {
    const github = {
      getPullRequestDetail: async () => ({
        merged: true,
        title: 'Ship feature',
        number: 7,
      }),
    } as unknown as GitHubService;
    const ctx = makeCtx(tmp, github);

    ctx.repos.workspaces.create({
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/example/demo',
      repoPath: tmp,
      defaultBranch: 'main',
      githubOwner: 'example',
      githubRepo: 'demo',
      createdAt: '2026-01-01T00:00:00.000Z',
    } satisfies Workspace);
    ctx.repos.worktrees.create({
      id: 'wt-1',
      workspaceId: 'ws-1',
      name: 'pr-7',
      path: tmp,
      branch: 'pr-7',
      prNumber: 7,
      prTitle: 'Ship feature',
      baseBranch: 'main',
      createdAt: '2026-01-01T00:00:00.000Z',
    } satisfies Worktree);
    ctx.repos.agents.create({
      id: 'ag-1',
      worktreeId: 'wt-1',
      name: 'PR #7 agent',
      status: 'idle',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'plan',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      activeSessionId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
    } satisfies Agent);

    const merged = await listMergedFleetAgents(ctx);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.agentId, 'ag-1');
    assert.equal(merged[0]?.prNumber, 7);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('listMergedFleetAgents skips archived agents and open pull requests', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-fleet-'));
  try {
    const github = {
      getPullRequestDetail: async (_owner: string, _repo: string, number: number) => ({
        merged: number === 7,
        title: `PR ${number}`,
        number,
      }),
    } as unknown as GitHubService;
    const ctx = makeCtx(tmp, github);

    ctx.repos.workspaces.create({
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/example/demo',
      repoPath: tmp,
      defaultBranch: 'main',
      githubOwner: 'example',
      githubRepo: 'demo',
      createdAt: '2026-01-01T00:00:00.000Z',
    } satisfies Workspace);
    for (const item of [
      { id: 'wt-1', pr: 7, agent: 'ag-1', archived: '2026-01-02T00:00:00.000Z' },
      { id: 'wt-2', pr: 8, agent: 'ag-2', archived: null },
    ]) {
      ctx.repos.worktrees.create({
        id: item.id,
        workspaceId: 'ws-1',
        name: item.id,
        path: tmp,
        branch: `pr-${item.pr}`,
        prNumber: item.pr,
        prTitle: `PR ${item.pr}`,
        baseBranch: 'main',
        createdAt: '2026-01-01T00:00:00.000Z',
      } satisfies Worktree);
      ctx.repos.agents.create({
        id: item.agent,
        worktreeId: item.id,
        name: item.agent,
        status: 'idle',
        model: 'sonnet',
        effort: 'high',
        permissionMode: 'plan',
        claudeSessionId: null,
        pid: null,
        runLogPath: null,
        activeSessionId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: item.archived,
      } satisfies Agent);
    }

    const merged = await listMergedFleetAgents(ctx);
    assert.equal(merged.length, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
