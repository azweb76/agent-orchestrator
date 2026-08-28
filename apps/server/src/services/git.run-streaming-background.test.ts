import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ClaudeService, isPidAlive } from './git.js';
import { writeFakeClaude } from './git.test-helpers.js';

test('runStreaming keeps a run alive across a background task and captures the wake turn', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-bg-task-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  // Parent turn ends (`result`) while a background Explore task is still
  // running; the CLI wakes the model once the task settles. The launch
  // tool_result must not look like the Task finished — otherwise the run
  // closes on the first result and never sees the wake turn.
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
    type: 'assistant',
    session_id: 'sess-bg',
    message: {
      content: [
        { type: 'text', text: 'Launched an Explore agent.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'Task',
          input: {
            description: 'Explore repo',
            subagent_type: 'Explore',
            run_in_background: true,
          },
        },
      ],
    },
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
  w({
    type: 'user',
    session_id: 'sess-bg',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Background agent launched' }],
    },
  });
  w({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'Launched an Explore agent.' } },
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
