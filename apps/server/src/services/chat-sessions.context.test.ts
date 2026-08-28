import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getAgentSessionContext } from './app.js';
import { seedAgent } from './chat-sessions.test-helpers.js';

test('getAgentSessionContext returns empty usage when no session file exists', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-ctx-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('plan-sess')!,
      claudeSessionId: `missing-${Date.now()}`,
    });
    const usage = await getAgentSessionContext(ctx, agent.id, 'plan-sess');
    assert.equal(usage.currentContextTokens, 0);
    assert.equal(usage.history.length, 0);
    assert.equal(usage.contextWindowTokens, 200_000);
    assert.equal(usage.compactThresholdTokens, 167_000);
    assert.equal(usage.sessionFilePath, null);
    assert.equal(usage.model, 'sonnet');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('getAgentSessionContext reads occupancy from the Claude session file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-ctx-file-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const session = ctx.repos.sessions.getById('plan-sess')!;
    const sessionFile = path.join(tmp, 'runs', 'claude-plan.jsonl');
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });
    await fs.writeFile(
      sessionFile,
      `${JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: 'Working' }],
          usage: {
            input_tokens: 80,
            output_tokens: 12,
            cache_read_input_tokens: 1500,
          },
        },
      })}\n`,
    );
    ctx.repos.sessions.update({
      ...session,
      claudeSessionId: `ao-test-${Date.now()}`,
      runLogPath: sessionFile,
    });

    const usage = await getAgentSessionContext(ctx, agent.id, 'plan-sess');
    assert.equal(usage.currentContextTokens, 1580);
    assert.equal(usage.history.length, 1);
    assert.equal(usage.usage?.cacheReadInputTokens, 1500);
    assert.equal(usage.sessionFilePath, sessionFile);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('getAgentSessionContext falls back to the run log when the session JSONL has no occupancy', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-ctx-fallback-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const session = ctx.repos.sessions.getById('plan-sess')!;
    const configDir = path.join(tmp, 'claude-config');
    const sessionId = `ao-empty-${Date.now()}`;
    const emptySessionFile = path.join(
      configDir,
      'projects',
      path.resolve(tmp).replace(/[^A-Za-z0-9]/g, '-'),
      `${sessionId}.jsonl`,
    );
    const runLog = path.join(tmp, 'runs', 'live.log');
    await fs.mkdir(path.dirname(emptySessionFile), { recursive: true });
    await fs.mkdir(path.dirname(runLog), { recursive: true });
    await fs.writeFile(emptySessionFile, `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`);
    await fs.writeFile(
      runLog,
      `${JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-opus-4-20250514',
          content: [{ type: 'text', text: 'From run log' }],
          usage: {
            input_tokens: 40,
            output_tokens: 9,
            cache_read_input_tokens: 2200,
          },
        },
      })}\n`,
    );

    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
    try {
      ctx.repos.sessions.update({
        ...session,
        claudeSessionId: sessionId,
        runLogPath: runLog,
        pid: null,
        status: 'idle',
      });

      const usage = await getAgentSessionContext(ctx, agent.id, 'plan-sess');
      assert.equal(usage.currentContextTokens, 2240);
      assert.equal(usage.model, 'claude-opus-4-20250514');
      assert.equal(usage.sessionFilePath, runLog);
      assert.equal(usage.history.length, 1);
    } finally {
      if (previousConfigDir == null) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
