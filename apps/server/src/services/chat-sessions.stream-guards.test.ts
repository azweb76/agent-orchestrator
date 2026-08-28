import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { streamAgentChat } from './app.js';
import { ClaudeService } from './git.js';
import { mockResponse, seedAgent } from './chat-sessions.test-helpers.js';

test('streamAgentChat rejects a non-force send while a tracked run has no persisted pid yet', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-guard-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    // Startup window: the session is marked running but onStarted has not
    // persisted the pid yet — only the in-process tracked run knows about it.
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('plan-sess')!,
      status: 'running',
      pid: null,
      updatedAt: new Date().toISOString(),
    });
    ctx.claude = {
      getRunningProcess: (id: string) =>
        id === 'plan-sess' ? { pid: 999_999_999, logPath: path.join(tmp, 'run.log') } : undefined,
    } as unknown as ClaudeService;

    const before = ctx.repos.messages.listBySession('plan-sess').length;
    const { res } = mockResponse();
    await assert.rejects(
      () => streamAgentChat(ctx, agent.id, { message: 'second send' }, res, 'plan-sess'),
      /already has a running Claude process/,
    );
    // No orphan user message that Claude never received.
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, before);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat reserves an idle session before asynchronously saving images', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-reserve-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    let starts = 0;
    let releaseRun: (() => void) | undefined;
    const runDone = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    ctx.claude = {
      getRunningProcess: () => undefined,
      runStreaming: async (
        _id: string,
        options: { onStarted?: (handle: { pid: number; logPath: string }) => void },
      ) => {
        starts += 1;
        options.onStarted?.({ pid: 999_999_999, logPath: path.join(tmp, 'run.log') });
        await runDone;
        return { result: 'done', sessionId: 'claude-reserved', events: [], stopped: false };
      },
    } as unknown as ClaudeService;
    const image = { name: 'test.png', mimeType: 'image/png', dataBase64: 'aW1hZ2U=' };

    const first = streamAgentChat(ctx, agent.id, { message: 'first', images: [image] }, null, 'plan-sess');
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 1_000;
      const check = () => {
        if (ctx.repos.sessions.getById('plan-sess')?.status === 'running') {
          resolve();
        } else if (Date.now() >= deadline) {
          reject(new Error('Session was not reserved'));
        } else {
          setTimeout(check, 5);
        }
      };
      check();
    });
    await assert.rejects(
      () => streamAgentChat(ctx, agent.id, { message: 'second', images: [image] }, null, 'plan-sess'),
      /already has a running Claude process/,
    );
    releaseRun?.();
    await first;

    assert.equal(starts, 1);
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 4);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('streamAgentChat force-send interrupts a tracked run that has no persisted pid', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-guard-force-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('plan-sess')!,
      status: 'running',
      pid: null,
      updatedAt: new Date().toISOString(),
    });

    const stoppedIds: string[] = [];
    ctx.claude = {
      // Use a pid outside the OS range so the stop-wait loop sees it as dead.
      getRunningProcess: (id: string) =>
        id === 'plan-sess' && stoppedIds.length === 0
          ? { pid: 999_999_999, logPath: path.join(tmp, 'run.log') }
          : undefined,
      stop: (id: string) => {
        stoppedIds.push(id);
        return true;
      },
      runStreaming: async (
        _id: string,
        options: { onStarted?: (handle: { pid: number; logPath: string }) => void },
      ) => {
        options.onStarted?.({ pid: 4343, logPath: path.join(tmp, 'next.log') });
        return {
          result: 'interrupted and replied',
          sessionId: 'claude-next',
          events: [],
          stopped: false,
        };
      },
    } as unknown as ClaudeService;

    const { res, chunks } = mockResponse();
    await streamAgentChat(ctx, agent.id, { message: 'force send', force: true }, res, 'plan-sess');

    assert.deepEqual(stoppedIds, ['plan-sess']);
    const session = ctx.repos.sessions.getById('plan-sess');
    assert.equal(session?.status, 'idle');
    assert.equal(session?.claudeSessionId, 'claude-next');
    const assistant = ctx.repos.messages
      .listBySession('plan-sess')
      .filter((item) => item.role === 'assistant')
      .at(-1);
    assert.equal(assistant?.content, 'interrupted and replied');
    assert.ok(chunks.some((chunk) => chunk.includes('event: done')));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
