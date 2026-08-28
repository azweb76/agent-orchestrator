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

test('runStreaming keeps a run alive across a background task and captures the wake turn', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-bg-task-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  // Parent turn ends (`result`) while a background Explore task is still
  // running; the CLI wakes the model once the task settles. The notification
  // arrives well after the old 1.5s post-result reap window, so the old
  // behavior (close stdin + SIGTERM after the first result) fails this test.
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  w({ type: 'system', session_id: 'sess-bg' });
  w({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'Launched an Explore agent.' } },
    session_id: 'sess-bg',
  });
  w({
    type: 'system',
    subtype: 'task_started',
    task_id: 't1',
    task_type: 'local_agent',
    tool_use_id: 'toolu_1',
    description: 'Explore repo',
    session_id: 'sess-bg',
  });
  w({ type: 'result', result: 'Launched an Explore agent.', session_id: 'sess-bg' });
  setTimeout(() => {
    w({
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      summary: 'found it',
      session_id: 'sess-bg',
    });
    w({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'Explore finished; here is the plan.' } },
      session_id: 'sess-bg',
    });
    w({ type: 'result', result: 'Explore finished; here is the plan.', session_id: 'sess-bg' });
  }, 3000);
});
rl.on('close', () => process.exit(0));
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;
  const result = await service.runStreaming('sess-bg-task', {
    cwd: tmp,
    prompt: 'increase redis timeouts',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(
    result.result,
    'Launched an Explore agent.\n\nExplore finished; here is the plan.',
  );
  assert.equal(result.sessionId, 'sess-bg');
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);
  assert.equal(service.getRunningProcess('sess-bg-task'), undefined);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('runStreaming survives the launch ack of a backgrounded agent', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-bg-ack-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  // Real CLI shape for a backgrounded Agent: `task_started` (is_backgrounded),
  // then an immediate `tool_result` acking the launch, then the parent `result`
  // while the subagent is still working. The ack must not finish the row —
  // otherwise the run is reaped and the promised follow-up never arrives.
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  w({ type: 'system', session_id: 'sess-ack' });
  w({
    type: 'assistant',
    session_id: 'sess-ack',
    message: {
      content: [{
        type: 'tool_use',
        id: 'toolu_1',
        name: 'Agent',
        input: { description: 'Explore light theme', subagent_type: 'Explore' },
      }],
    },
  });
  w({
    type: 'system',
    subtype: 'task_started',
    task_id: 't1',
    tool_use_id: 'toolu_1',
    task_type: 'local_agent',
    subagent_type: 'Explore',
    description: 'Explore light theme',
    is_backgrounded: true,
    session_id: 'sess-ack',
  });
  w({
    type: 'user',
    session_id: 'sess-ack',
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: 'toolu_1',
        content: [{ type: 'text', text: 'Async agent launched successfully.' }],
      }],
    },
  });
  w({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: "I've kicked off an exploration." } },
    session_id: 'sess-ack',
  });
  w({ type: 'result', result: "I've kicked off an exploration.", session_id: 'sess-ack' });
  setTimeout(() => {
    w({
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      summary: 'found the theme bug',
      session_id: 'sess-ack',
    });
    w({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: ' The theme bug is in theme.ts.' } },
      session_id: 'sess-ack',
    });
    w({ type: 'result', result: 'The theme bug is in theme.ts.', session_id: 'sess-ack' });
  }, 3000);
});
rl.on('close', () => process.exit(0));
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;
  const result = await service.runStreaming('sess-bg-ack', {
    cwd: tmp,
    prompt: 'fix the light theme',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(
    result.result,
    "I've kicked off an exploration.\n\nThe theme bug is in theme.ts.",
  );
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);
  assert.equal(service.getRunningProcess('sess-bg-ack'), undefined);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('runStreaming closes a deferred run when no wake turn follows the settled task', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-bg-nowake-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  // Task settles after the deferred result but the CLI never wakes the model.
  // The wake-grace timer must close stdin so the run does not hang forever.
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  w({ type: 'system', session_id: 'sess-nowake' });
  w({
    type: 'system',
    subtype: 'task_started',
    task_id: 't1',
    task_type: 'local_agent',
    tool_use_id: 'toolu_1',
    session_id: 'sess-nowake',
  });
  w({ type: 'result', result: 'Launched.', session_id: 'sess-nowake' });
  setTimeout(() => {
    w({
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      tool_use_id: 'toolu_1',
      status: 'completed',
      session_id: 'sess-nowake',
    });
  }, 250);
});
rl.on('close', () => process.exit(0));
`,
  );

  const service = new ClaudeService(binPath, runsDir, { wakeGraceMs: 400 });
  let pid: number | null = null;
  const result = await service.runStreaming('sess-nowake', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(result.result, 'Launched.');
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);
  assert.equal(service.getRunningProcess('sess-nowake'), undefined);

  await fs.rm(tmp, { recursive: true, force: true });
});
