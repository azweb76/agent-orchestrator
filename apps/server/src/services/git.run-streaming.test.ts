import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ClaudeService, isPidAlive } from './git.js';
import { writeFakeClaude } from './git.test-helpers.js';

test('runStreaming rejects when the Claude binary is missing instead of crashing', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-missing-'));
  const runsDir = path.join(tmp, 'runs');
  const service = new ClaudeService(path.join(tmp, 'no-such-claude'), runsDir);

  await assert.rejects(
    () => service.runStreaming('sess-missing', { cwd: tmp, prompt: 'hi' }),
    /Failed to start Claude process/,
  );

  await fs.rm(tmp, { recursive: true, force: true });
});

test('runStreaming completes when Claude emits result then waits on stdin', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-result-eof-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'sess-eof' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'Hi!' } },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'Hi!',
    session_id: 'sess-eof',
  }) + '\\n');
});
rl.on('close', () => process.exit(0));
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;
  const result = await service.runStreaming('sess-eof', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(result.result, 'Hi!');
  assert.equal(result.sessionId, 'sess-eof');
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);
  assert.equal(service.getRunningProcess('sess-eof'), undefined);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('runStreaming reaps a process that hangs after the result event', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-result-hang-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'sess-hang' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'Hi there.' }] },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'Hi there.',
    session_id: 'sess-hang',
  }) + '\\n');
});
setInterval(() => {}, 1000);
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;
  const result = await service.runStreaming('sess-hang', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(result.result, 'Hi there.');
  assert.equal(result.sessionId, 'sess-hang');
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);
  assert.equal(service.getRunningProcess('sess-hang'), undefined);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('runStreaming ignores nested Explore results until the parent turn result', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-nested-result-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'sess-parent' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'Waiting on the Explore agent.' } },
    session_id: 'sess-parent',
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'assistant',
    parent_tool_use_id: 'tool_explore',
    session_id: 'sess-explore',
    message: { content: [{ type: 'text', text: 'No nested guidance for release-manager/.' }] },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    parent_tool_use_id: 'tool_explore',
    result: 'Conflicts are in src/merge.ts',
    session_id: 'sess-explore',
  }) + '\\n');
  setTimeout(() => {
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: ' Here is the plan.' } },
      session_id: 'sess-parent',
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'Waiting on the Explore agent. Here is the plan.',
      session_id: 'sess-parent',
    }) + '\\n');
    process.exit(0);
  }, 1800);
});
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;
  const result = await service.runStreaming('sess-nested', {
    cwd: tmp,
    prompt: 'plan the merge',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(result.result, 'Waiting on the Explore agent. Here is the plan.');
  assert.equal(result.sessionId, 'sess-parent');
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('runStreaming ignores nested results that omit parent_tool_use_id', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-nested-sid-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'sess-parent' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'Launching explore agents.' } },
    session_id: 'sess-parent',
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: '',
    session_id: 'sess-explore',
    total_cost_usd: 0,
  }) + '\\n');
  setTimeout(() => {
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: ' Here is the plan.' } },
      session_id: 'sess-parent',
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'Launching explore agents. Here is the plan.',
      session_id: 'sess-parent',
      total_cost_usd: 0.28,
    }) + '\\n');
    process.exit(0);
  }, 1800);
});
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;
  const result = await service.runStreaming('sess-nested-sid', {
    cwd: tmp,
    prompt: 'plan the merge',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(result.result, 'Launching explore agents. Here is the plan.');
  assert.equal(result.sessionId, 'sess-parent');
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);

  await fs.rm(tmp, { recursive: true, force: true });
});
