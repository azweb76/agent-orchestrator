import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stopAgent } from './agents-lifecycle.js';
import { ClaudeService } from './git.js';
import { seedAgent } from './chat-sessions.test-helpers.js';

test('stopAgent clears running sessions and rolls agent to idle', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-stop-agent-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const stopped: Array<{ sessionId: string; pid: number | null }> = [];
    ctx.claude = {
      stop(sessionId: string, pid?: number | null) {
        stopped.push({ sessionId, pid: pid ?? null });
        return true;
      },
    } as unknown as ClaudeService;

    const session = ctx.repos.sessions.getById('plan-sess')!;
    ctx.repos.sessions.update({
      ...session,
      status: 'running',
      pid: 42_424,
      runLogPath: path.join(tmp, 'run.log'),
      updatedAt: new Date().toISOString(),
    });
    ctx.repos.agents.update({
      ...agent,
      status: 'running',
      pid: 42_424,
      runLogPath: path.join(tmp, 'run.log'),
      updatedAt: new Date().toISOString(),
    });

    const updated = await stopAgent(ctx, agent.id);
    assert.equal(updated.status, 'idle');
    assert.equal(updated.pid, null);
    assert.deepEqual(stopped, [{ sessionId: 'plan-sess', pid: 42_424 }]);
    assert.equal(ctx.repos.sessions.getById('plan-sess')?.status, 'idle');
    assert.equal(ctx.repos.sessions.getById('plan-sess')?.pid, null);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('stopAgent is a no-op when nothing is live', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-stop-agent-idle-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    let stopCalls = 0;
    ctx.claude = {
      stop() {
        stopCalls += 1;
        return false;
      },
    } as unknown as ClaudeService;

    const updated = await stopAgent(ctx, agent.id);
    assert.equal(updated.status, 'idle');
    assert.equal(stopCalls, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
