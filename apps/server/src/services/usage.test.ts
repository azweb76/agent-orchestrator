import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { getUsageSummary, type AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';

async function seed(tmp: string): Promise<AppContext> {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    claude: new ClaudeService('claude', path.join(tmp, 'runs')),
    anthropic: {} as AnthropicService,
    dataDir: tmp,
  };

  repos.workspaces.create({
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    repoPath: tmp,
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Workspace);
  repos.worktrees.create({
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'agent-1',
    path: tmp,
    branch: 'feat',
    prNumber: null,
    prTitle: null,
    baseBranch: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Worktree);
  repos.agents.create({
    id: 'ag-1',
    worktreeId: 'wt-1',
    name: 'Agent One',
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
  repos.sessions.create({
    id: 'sess-1',
    agentId: 'ag-1',
    title: 'Plan work',
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
  });
  return ctx;
}

function addAssistantTurn(
  ctx: AppContext,
  opts: { id: string; sessionId: string; costUsd?: number; createdAt: string },
): void {
  ctx.repos.messages.create({
    id: opts.id,
    agentId: 'ag-1',
    sessionId: opts.sessionId,
    role: 'assistant',
    content: 'done',
    attachments: [],
    metadata: opts.costUsd == null ? {} : { costUsd: opts.costUsd },
    createdAt: opts.createdAt,
  });
}

test('getUsageSummary rolls up cost per session and agent with a daily total', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-usage-'));
  try {
    const ctx = await seed(tmp);
    const today = new Date().toISOString();

    addAssistantTurn(ctx, { id: 'm1', sessionId: 'sess-1', costUsd: 0.25, createdAt: '2026-01-02T00:00:00.000Z' });
    addAssistantTurn(ctx, { id: 'm2', sessionId: 'sess-1', costUsd: 0.5, createdAt: today });
    // Turn without cost metadata is ignored by the rollup.
    addAssistantTurn(ctx, { id: 'm3', sessionId: 'sess-1', createdAt: today });
    // Turn from a deleted session still counts toward the agent.
    addAssistantTurn(ctx, { id: 'm4', sessionId: 'sess-gone', costUsd: 0.1, createdAt: today });
    // User messages never carry cost and are excluded by role.
    ctx.repos.messages.create({
      id: 'm5',
      agentId: 'ag-1',
      sessionId: 'sess-1',
      role: 'user',
      content: 'hi',
      attachments: [],
      metadata: {},
      createdAt: today,
    });

    const summary = getUsageSummary(ctx);
    assert.equal(summary.totalCostUsd, 0.85);
    assert.equal(summary.todayCostUsd, 0.6);
    assert.equal(summary.totalAssistantTurns, 3);

    assert.equal(summary.agents.length, 1);
    const agent = summary.agents[0];
    assert.equal(agent.agentId, 'ag-1');
    assert.equal(agent.agentName, 'Agent One');
    assert.equal(agent.workspaceName, 'demo');
    assert.equal(agent.costUsd, 0.85);
    assert.equal(agent.assistantTurns, 3);

    const bySession = new Map(agent.sessions.map((s) => [s.sessionId, s]));
    assert.equal(bySession.get('sess-1')?.costUsd, 0.75);
    assert.equal(bySession.get('sess-1')?.title, 'Plan work');
    assert.equal(bySession.get('sess-gone')?.costUsd, 0.1);
    assert.equal(bySession.get('sess-gone')?.title, 'Deleted session');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('getUsageSummary returns zeroes when no turns recorded cost', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-usage-'));
  try {
    const ctx = await seed(tmp);
    const summary = getUsageSummary(ctx);
    assert.equal(summary.totalCostUsd, 0);
    assert.equal(summary.todayCostUsd, 0);
    assert.equal(summary.totalAssistantTurns, 0);
    assert.deepEqual(summary.agents, []);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
