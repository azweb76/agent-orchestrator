import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { updateAppSettings } from './app-settings.js';
import { evaluateSpendCap, buildSpendBudgetStatus } from './spend-cap.js';
import { enqueueSpendCapBlocked } from './chat-queue.js';
import type { AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { Notifier } from './notifier.js';

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
    notifier: new Notifier(),
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
  });
  repos.agents.update({
    ...repos.agents.getById('ag-1')!,
    activeSessionId: 'sess-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  return ctx;
}

test('evaluateSpendCap returns null when caps are disabled', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-cap-'));
  try {
    const ctx = await seed(tmp);
    assert.equal(evaluateSpendCap(ctx, 'ag-1'), null);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('evaluateSpendCap blocks when daily cap is exceeded', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-cap-'));
  try {
    const ctx = await seed(tmp);
    updateAppSettings(ctx.repos, { dailySpendCapUsd: 1 });
    const today = new Date().toISOString();
    ctx.repos.messages.create({
      id: 'm1',
      agentId: 'ag-1',
      sessionId: 'sess-1',
      role: 'assistant',
      content: 'done',
      attachments: [],
      metadata: { costUsd: 1.25 },
      createdAt: today,
    });

    const block = evaluateSpendCap(ctx, 'ag-1');
    assert.ok(block);
    assert.equal(block.reason, 'daily_cap');

    const budget = buildSpendBudgetStatus(ctx);
    assert.equal(budget.remainingDailyUsd, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('enqueueSpendCapBlocked queues a message with blockedReason', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-cap-'));
  try {
    const ctx = await seed(tmp);
    updateAppSettings(ctx.repos, { perAgentSpendCapUsd: 0.5 });
    const today = new Date().toISOString();
    ctx.repos.messages.create({
      id: 'm1',
      agentId: 'ag-1',
      sessionId: 'sess-1',
      role: 'assistant',
      content: 'done',
      attachments: [],
      metadata: { costUsd: 0.75 },
      createdAt: today,
    });
    const session = ctx.repos.sessions.getById('sess-1')!;
    const block = evaluateSpendCap(ctx, 'ag-1');
    assert.ok(block);

    const events: string[] = [];
    ctx.notifier?.subscribe((event) => events.push(event.type));

    const queued = await enqueueSpendCapBlocked(
      ctx,
      'ag-1',
      session,
      { message: 'continue please' },
      block,
      null,
    );
    assert.equal(queued.blockedReason, 'per_agent_cap');
    assert.equal(ctx.repos.queued.listBySession('sess-1').length, 1);
    assert.ok(events.includes('spend_cap_blocked'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
