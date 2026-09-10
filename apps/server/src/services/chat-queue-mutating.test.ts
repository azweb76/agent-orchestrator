import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ChatSession } from '@agent-orchestrator/shared';
import {
  drainSessionQueue,
  enqueueChatMessage,
  listQueuedMessages,
  updateAppSettings,
  type AppContext,
} from './app.js';
import { drainWaitingMutatingSessions } from './chat-queue.js';
import { seedAgent } from './chat-sessions.test-helpers.js';
import type { ClaudeService } from './git.js';

/**
 * The git-mutating handoff loop used to spin without ever yielding, so timers
 * never fired and a `setTimeout` bound could not fire either. Counting the
 * once-per-pass session scan and throwing past the limit makes a regression
 * fail fast instead of hanging the suite.
 */
function boundSessionScans(ctx: AppContext, limit: number): { calls: number } {
  const repo = ctx.repos.sessions;
  const listByAgent = repo.listByAgent.bind(repo);
  const state = { calls: 0 };
  repo.listByAgent = (agentId: string): ChatSession[] => {
    state.calls += 1;
    if (state.calls > limit) {
      throw new Error(`spin detected: ${state.calls} session scans in one drain`);
    }
    return listByAgent(agentId);
  };
  return state;
}

function createMutatingSession(
  ctx: AppContext,
  id: string,
  status: ChatSession['status'],
  updatedAt = '2026-01-01T00:00:00.000Z',
): ChatSession {
  return ctx.repos.sessions.create({
    ...ctx.repos.sessions.getById('plan-sess')!,
    id,
    title: 'Build',
    template: 'build',
    status,
    updatedAt,
  });
}

test('drainWaitingMutatingSessions stops when the agent is archived', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-mutating-archived-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    // Archiving never resets 'queued' back to 'idle', so this session stays
    // selectable forever while every drain of it bails on the archived agent.
    createMutatingSession(ctx, 'sess-build', 'queued');
    await enqueueChatMessage(ctx, agent.id, 'sess-build', { message: 'later' }, { drain: false });
    ctx.repos.agents.update({ ...agent, archivedAt: new Date().toISOString() });

    const scans = boundSessionScans(ctx, 5);
    await drainWaitingMutatingSessions(ctx, agent.id);

    assert.ok(scans.calls <= 5, `expected a bounded loop, saw ${scans.calls} scans`);
    assert.equal(await drainSessionQueue(ctx, agent.id, 'sess-build'), 'not-eligible');
    assert.equal(ctx.repos.sessions.getById('sess-build')?.status, 'queued');
    assert.equal(listQueuedMessages(ctx, agent.id, 'sess-build').length, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('drainWaitingMutatingSessions stops when a spend cap blocks the queue', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-mutating-spend-cap-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    createMutatingSession(ctx, 'sess-build', 'idle');
    await enqueueChatMessage(ctx, agent.id, 'sess-build', { message: 'ship it' }, { drain: false });
    ctx.repos.messages.create({
      id: 'msg-cost',
      agentId: agent.id,
      sessionId: 'plan-sess',
      role: 'assistant',
      content: 'spent',
      attachments: [],
      metadata: { costUsd: 5 },
      createdAt: new Date().toISOString(),
    });
    updateAppSettings(ctx.repos, { dailySpendCapUsd: 1 });

    const scans = boundSessionScans(ctx, 5);
    await drainWaitingMutatingSessions(ctx, agent.id);

    assert.ok(scans.calls <= 5, `expected a bounded loop, saw ${scans.calls} scans`);
    assert.equal(await drainSessionQueue(ctx, agent.id, 'sess-build'), 'blocked');
    const queued = listQueuedMessages(ctx, agent.id, 'sess-build');
    assert.equal(queued.length, 1);
    assert.equal(queued[0]?.blockedReason, 'daily_cap');
    // A cap block parks the message; it must not also claim the worktree lock.
    assert.equal(ctx.repos.sessions.getById('sess-build')?.status, 'idle');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('drainWaitingMutatingSessions still releases a stale queued session', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-mutating-handoff-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    createMutatingSession(ctx, 'sess-build', 'queued');

    const scans = boundSessionScans(ctx, 5);
    await drainWaitingMutatingSessions(ctx, agent.id);

    assert.ok(scans.calls <= 5, `expected a bounded loop, saw ${scans.calls} scans`);
    assert.equal(ctx.repos.sessions.getById('sess-build')?.status, 'idle');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('drainWaitingMutatingSessions hands off past a session whose send throws', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-mutating-failed-send-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    // 'sess-build' stays selectable after its message is taken (its status
    // stays 'queued'), so a failed send must not strand the later waiter.
    createMutatingSession(ctx, 'sess-build', 'queued');
    createMutatingSession(ctx, 'sess-build-2', 'queued', '2026-01-02T00:00:00.000Z');
    await enqueueChatMessage(ctx, agent.id, 'sess-build', { message: 'boom' }, { drain: false });
    ctx.claude = {
      getRunningProcess: (id: string) =>
        id === 'sess-build' ? { pid: 999_999_999, logPath: path.join(tmp, 'run.log') } : undefined,
    } as unknown as ClaudeService;

    // Looser than the other cases: the attempted send scans sessions too (7
    // total today), while a spin blows past any small limit immediately.
    const scans = boundSessionScans(ctx, 12);
    await drainWaitingMutatingSessions(ctx, agent.id);

    assert.ok(scans.calls <= 12, `expected a bounded loop, saw ${scans.calls} scans`);
    assert.equal(ctx.repos.sessions.getById('sess-build-2')?.status, 'idle');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
