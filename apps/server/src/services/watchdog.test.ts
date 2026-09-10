import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { updateAppSettings } from './app-settings.js';
import type { AppContext } from './app.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';
import { Notifier } from './notifier.js';
import { resetWatchdogState, runWatchdogTick, isAgentStalled } from './watchdog.js';

async function seed(tmp: string): Promise<AppContext> {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  const ctx: AppContext = {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    jira: new JiraService({}),
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
    status: 'running',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: 99_999,
    runLogPath: null,
    activeSessionId: 'sess-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  } satisfies Agent);
  repos.sessions.create({
    id: 'sess-1',
    agentId: 'ag-1',
    title: 'Chat',
    template: 'chat',
    status: 'running',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: 99_999,
    runLogPath: '/tmp/fake.log',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  return ctx;
}

test('watchdog heals stale running session when pid is dead', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-watchdog-'));
  try {
    resetWatchdogState();
    const ctx = await seed(tmp);
    updateAppSettings(ctx.repos, { watchdogEnabled: true, watchdogStaleRunEnabled: true });

    const events: string[] = [];
    ctx.notifier?.subscribe((event) => events.push(event.type));

    runWatchdogTick(ctx);

    const session = ctx.repos.sessions.getById('sess-1');
    assert.equal(session?.status, 'idle');
    assert.equal(session?.pid, null);
    assert.ok(events.includes('watchdog_alert'));
    assert.equal(isAgentStalled('ag-1'), true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
    resetWatchdogState();
  }
});

test('watchdog flags stale pending permissions', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-watchdog-'));
  try {
    resetWatchdogState();
    const ctx = await seed(tmp);
    updateAppSettings(ctx.repos, {
      watchdogEnabled: true,
      watchdogPermissionMinutes: 1,
      watchdogStaleRunEnabled: false,
    });

    const staleAt = Date.now() - 5 * 60_000;
    (ctx.claude as unknown as { running: Map<string, unknown> }).running.set('sess-1', {
      pid: process.pid,
      logPath: '/tmp/fake.log',
      pendingPermissions: new Map([
        [
          'req-1',
          {
            requestId: 'req-1',
            toolName: 'AskUserQuestion',
            input: {},
            requestedAt: staleAt,
          },
        ],
      ]),
      lastStreamAt: Date.now(),
    });

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.notifier?.subscribe((event) => events.push({ type: event.type, data: event.data }));

    runWatchdogTick(ctx);

    const alert = events.find((event) => event.type === 'watchdog_alert');
    assert.ok(alert);
    assert.equal(alert.data.kind, 'permission_stale');
    assert.equal(isAgentStalled('ag-1'), true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
    resetWatchdogState();
  }
});

test('watchdog can re-raise stale_run after the session recovers and stalls again', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-watchdog-'));
  try {
    resetWatchdogState();
    const ctx = await seed(tmp);
    updateAppSettings(ctx.repos, { watchdogEnabled: true, watchdogStaleRunEnabled: true });

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.notifier?.subscribe((event) => events.push({ type: event.type, data: event.data }));

    runWatchdogTick(ctx);

    const staleRunAlerts = () =>
      events.filter((event) => event.type === 'watchdog_alert' && event.data.kind === 'stale_run');
    assert.equal(staleRunAlerts().length, 1);
    assert.equal(ctx.repos.sessions.getById('sess-1')?.status, 'idle');
    assert.equal(isAgentStalled('ag-1'), true);

    // Simulate the session running again and dying again with a dead pid.
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      status: 'running',
      pid: 88_888,
    });

    runWatchdogTick(ctx);

    assert.equal(staleRunAlerts().length, 2);
    assert.equal(ctx.repos.sessions.getById('sess-1')?.status, 'idle');
    assert.equal(isAgentStalled('ag-1'), true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
    resetWatchdogState();
  }
});

test('watchdog keeps the agent stall flag while any of its sessions is stalled', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-watchdog-'));
  try {
    resetWatchdogState();
    const ctx = await seed(tmp);
    updateAppSettings(ctx.repos, {
      watchdogEnabled: true,
      watchdogPermissionMinutes: 1,
      watchdogStaleRunEnabled: false,
    });

    // sess-1 (created first, so it's iterated before sess-2) has a stale pending
    // permission; sess-2 (iterated after, since listRunning() orders by updated_at
    // ascending) is completely healthy.
    ctx.repos.sessions.create({
      id: 'sess-2',
      agentId: 'ag-1',
      title: 'Chat 2',
      template: 'chat',
      status: 'running',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'plan',
      claudeSessionId: null,
      pid: process.pid,
      runLogPath: '/tmp/fake2.log',
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });

    const staleAt = Date.now() - 5 * 60_000;
    (ctx.claude as unknown as { running: Map<string, unknown> }).running.set('sess-1', {
      pid: 99_999,
      logPath: '/tmp/fake.log',
      pendingPermissions: new Map([
        [
          'req-1',
          {
            requestId: 'req-1',
            toolName: 'AskUserQuestion',
            input: {},
            requestedAt: staleAt,
          },
        ],
      ]),
      lastStreamAt: Date.now(),
    });
    (ctx.claude as unknown as { running: Map<string, unknown> }).running.set('sess-2', {
      pid: process.pid,
      logPath: '/tmp/fake2.log',
      pendingPermissions: new Map(),
      lastStreamAt: Date.now(),
    });

    runWatchdogTick(ctx);

    assert.equal(isAgentStalled('ag-1'), true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
    resetWatchdogState();
  }
});

test('watchdog does not clear permission_stale when a fresher prompt is not stale', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-watchdog-'));
  try {
    resetWatchdogState();
    const ctx = await seed(tmp);
    updateAppSettings(ctx.repos, {
      watchdogEnabled: true,
      watchdogPermissionMinutes: 1,
      watchdogStaleRunEnabled: false,
    });

    const staleAt = Date.now() - 5 * 60_000;
    (ctx.claude as unknown as { running: Map<string, unknown> }).running.set('sess-1', {
      pid: process.pid,
      logPath: '/tmp/fake.log',
      // Insertion order matters: the older, still-stale prompt is evaluated
      // before the fresh one raised right after it.
      pendingPermissions: new Map([
        [
          'req-old',
          {
            requestId: 'req-old',
            toolName: 'AskUserQuestion',
            input: {},
            requestedAt: staleAt,
          },
        ],
        [
          'req-new',
          {
            requestId: 'req-new',
            toolName: 'Bash',
            input: {},
            requestedAt: Date.now(),
          },
        ],
      ]),
      lastStreamAt: Date.now(),
    });

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.notifier?.subscribe((event) => events.push({ type: event.type, data: event.data }));

    const permissionStaleAlerts = () =>
      events.filter(
        (event) => event.type === 'watchdog_alert' && event.data.kind === 'permission_stale',
      );

    runWatchdogTick(ctx);

    assert.equal(permissionStaleAlerts().length, 1);
    assert.equal(isAgentStalled('ag-1'), true);

    // Both prompts are still pending on the next tick (still stale, still fresh).
    // If the fresh prompt had wrongly cleared the dedup key, this tick would
    // re-emit a duplicate alert for the prompt that never stopped being stale.
    runWatchdogTick(ctx);

    assert.equal(permissionStaleAlerts().length, 1);
    assert.equal(isAgentStalled('ag-1'), true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
    resetWatchdogState();
  }
});

test('watchdog flags idle stream activity on live pid', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-watchdog-'));
  try {
    resetWatchdogState();
    const ctx = await seed(tmp);
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      pid: process.pid,
    });
    updateAppSettings(ctx.repos, {
      watchdogEnabled: true,
      watchdogStreamIdleMinutes: 1,
      watchdogStaleRunEnabled: false,
    });

    (ctx.claude as unknown as { running: Map<string, unknown> }).running.set('sess-1', {
      pid: process.pid,
      logPath: '/tmp/fake.log',
      pendingPermissions: new Map(),
      lastStreamAt: Date.now() - 5 * 60_000,
    });

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.notifier?.subscribe((event) => events.push({ type: event.type, data: event.data }));

    runWatchdogTick(ctx);

    const alert = events.find((event) => event.type === 'watchdog_alert');
    assert.ok(alert);
    assert.equal(alert.data.kind, 'stream_idle');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
    resetWatchdogState();
  }
});
