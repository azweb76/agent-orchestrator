import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app.js';
import { listSidebarTree } from './app.js';
import type { ClaudeService } from './git.js';
import { cachedClaudeInstalled, invalidateStatusCache } from './status-cache.js';
import { configureGithubToken } from './setup.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';

describe('listSidebarTree pending permission batching', () => {
  let dataDir: string;
  let ctx: AppContext;
  let listByAgentCalls = 0;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sidebar-'));
    const db = initDatabase(dataDir);
    const repos = createRepositories(db);
    const originalListByAgent = repos.sessions.listByAgent.bind(repos.sessions);
    repos.sessions.listByAgent = (agentId: string) => {
      listByAgentCalls += 1;
      return originalListByAgent(agentId);
    };
    const originalListByAgentIds = repos.sessions.listByAgentIds.bind(repos.sessions);
    repos.sessions.listByAgentIds = (agentIds: string[]) => originalListByAgentIds(agentIds);

    ctx = {
      repos,
      git: {} as AppContext['git'],
      github: {} as AppContext['github'],
      jira: {} as AppContext['jira'],
      claude: {
        listPendingPermissions: () => [],
      } as unknown as ClaudeService,
      anthropic: {} as AppContext['anthropic'],
      dataDir,
    };
    listByAgentCalls = 0;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('loads sessions in one batch for multiple agents', async () => {
    const workspace = {
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
    for (let i = 0; i < 3; i += 1) {
      const worktreeId = `wt-${i}`;
      ctx.repos.worktrees.create({
        id: worktreeId,
        workspaceId: workspace.id,
        name: `branch-${i}`,
        path: path.join(dataDir, worktreeId),
        branch: `feat-${i}`,
        prNumber: null,
        prTitle: null,
        baseBranch: 'main',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      const agentId = `ag-${i}`;
      ctx.repos.agents.create({
        id: agentId,
        worktreeId,
        name: `Agent ${i}`,
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
      });
      ctx.repos.sessions.create({
        id: `sess-${i}`,
        agentId,
        title: 'Chat',
        template: 'chat',
        status: 'idle',
        model: 'sonnet',
        effort: 'high',
        permissionMode: 'plan',
        claudeSessionId: null,
        pid: null,
        runLogPath: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        titleSource: 'default',
      });
    }

    const tree = await listSidebarTree(ctx);
    assert.equal(tree[0]?.agents.length, 3);
    assert.equal(listByAgentCalls, 0);
  });
});

describe('status-cache', () => {
  it('caches claude installed checks until invalidated', async () => {
    let calls = 0;
    const claude = {
      checkInstalled: async () => {
        calls += 1;
        return true;
      },
    } as unknown as ClaudeService;

    invalidateStatusCache();
    assert.equal(await cachedClaudeInstalled(claude), true);
    assert.equal(await cachedClaudeInstalled(claude), true);
    assert.equal(calls, 1);

    invalidateStatusCache();
    assert.equal(await cachedClaudeInstalled(claude), true);
    assert.equal(calls, 2);
  });
});

describe('configureGithubToken', () => {
  let dataDir: string;
  let ctx: AppContext;
  const previousToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-setup-'));
    const db = initDatabase(dataDir);
    ctx = {
      repos: createRepositories(db),
      git: {} as AppContext['git'],
      github: new GitHubService({}),
      jira: new JiraService({}),
      claude: { setBin: () => undefined, getBin: () => 'claude' } as unknown as ClaudeService,
      anthropic: {} as AppContext['anthropic'],
      dataDir,
    };
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousToken) process.env.GITHUB_TOKEN = previousToken;
    else delete process.env.GITHUB_TOKEN;
  });

  it('rejects empty tokens', async () => {
    await assert.rejects(() => configureGithubToken(ctx, '   '), /required/);
  });
});
