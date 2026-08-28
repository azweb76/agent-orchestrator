import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ClaudeService, isPidAlive } from './git.js';
import { FAKE_CLAUDE_ASK_USER, waitFor, writeFakeClaude } from './git.test-helpers.js';

test('detached Claude run survives releaseAll (app shutdown) and can be reattached', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-detach-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  // Emits stream-json over a few hundred ms so we can "shut down" mid-run.
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const session = 'sess-detach-1';
process.stdout.write(JSON.stringify({ type: 'system', session_id: session }) + '\\n');
setTimeout(() => {
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'hello ' } },
  }) + '\\n');
}, 150);
setTimeout(() => {
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'world' } },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'hello world',
    session_id: session,
  }) + '\\n');
  process.exit(0);
}, 400);
`,
  );

  const serviceA = new ClaudeService(binPath, runsDir);
  let startedPid: number | null = null;
  let startedLog: string | null = null;

  const runPromise = serviceA.runStreaming('agent-1', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      startedPid = handle.pid;
      startedLog = handle.logPath;
    },
  });

  // Wait until the process is up, then simulate orchestrator shutdown.
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(startedPid, 'expected onStarted pid');
  assert.ok(startedLog, 'expected onStarted log path');
  assert.equal(isPidAlive(startedPid!), true);

  // App shutdown: release handles without killing agents.
  serviceA.releaseAll();
  assert.equal(isPidAlive(startedPid!), true, 'Claude must keep running after releaseAll');

  const serviceB = new ClaudeService(binPath, runsDir);
  const result = await serviceB.attachToRun('agent-1', {
    pid: startedPid!,
    logPath: startedLog!,
  });

  // Original in-process monitor may still finish; ignore its outcome (simulates process.exit).
  await runPromise.catch(() => undefined);

  assert.equal(result.sessionId, 'sess-detach-1');
  assert.equal(result.result, 'hello world');
  assert.equal(result.stopped, false);
  assert.equal(isPidAlive(startedPid!), false);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('AskUserQuestion survives releaseAll and can be answered after reattach', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-perm-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(binPath, FAKE_CLAUDE_ASK_USER);

  const serviceA = new ClaudeService(binPath, runsDir);
  let startedPid: number | null = null;
  let startedLog: string | null = null;
  const seenText: string[] = [];

  const runPromise = serviceA.runStreaming('agent-1', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      startedPid = handle.pid;
      startedLog = handle.logPath;
    },
    onEvent: (event) => {
      if (event.event?.delta?.type === 'text_delta' && event.event.delta.text) {
        seenText.push(event.event.delta.text);
      }
    },
  });

  await waitFor(() => serviceA.listPendingPermissions('agent-1').length === 1);
  assert.ok(startedPid);
  assert.ok(startedLog);
  assert.equal(isPidAlive(startedPid!), true);
  assert.equal(serviceA.listPendingPermissions('agent-1')[0]?.toolName, 'AskUserQuestion');
  assert.deepEqual(seenText, ['What should I do?']);

  serviceA.releaseAll();
  assert.equal(isPidAlive(startedPid!), true, 'Claude must keep running while waiting for input');

  const serviceB = new ClaudeService(binPath, runsDir);
  const restored: string[] = [];
  const attachPromise = serviceB.attachToRun(
    'agent-1',
    { pid: startedPid!, logPath: startedLog! },
    {
      onPermissionRequest: (request) => restored.push(request.toolName),
    },
  );

  await waitFor(() => serviceB.listPendingPermissions('agent-1').length === 1);
  assert.equal(isPidAlive(startedPid!), true, 'reattach must not kill a waiting session');
  assert.deepEqual(restored, ['AskUserQuestion']);
  assert.equal(serviceB.listPendingPermissions('agent-1')[0]?.requestId, 'req-1');

  const answered = serviceB.respondToPermission('agent-1', 'req-1', {
    behavior: 'allow',
    updatedInput: { answers: { Q: 'A' } },
  });
  assert.equal(answered, true);

  const result = await attachPromise;
  await runPromise.catch(() => undefined);

  assert.equal(result.stopped, false);
  assert.equal(result.result, 'What should I do? thanks');
  assert.equal(isPidAlive(startedPid!), false);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('reattach does not kill a run whose log already contains an answered control_request', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-replay-cr-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  type: 'control_request',
  request_id: 'req-old',
  request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: {} },
}) + '\\n');
process.stdout.write(JSON.stringify({
  type: 'stream_event',
  event: { delta: { type: 'text_delta', text: 'already answered' } },
}) + '\\n');
setInterval(() => {
  process.stdout.write(JSON.stringify({ type: 'ping' }) + '\\n');
}, 80);
`,
  );

  const serviceA = new ClaudeService(binPath, runsDir);
  let startedPid: number | null = null;
  let startedLog: string | null = null;
  const runPromise = serviceA.runStreaming('agent-1', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      startedPid = handle.pid;
      startedLog = handle.logPath;
    },
  });

  await waitFor(() => startedPid != null && startedLog != null);
  await waitFor(() => {
    try {
      return readFileSync(startedLog!, 'utf8').includes('already answered');
    } catch {
      return false;
    }
  });

  serviceA.releaseAll();
  assert.equal(isPidAlive(startedPid!), true);

  const serviceB = new ClaudeService(binPath, runsDir);
  const attachPromise = serviceB.attachToRun('agent-1', {
    pid: startedPid!,
    logPath: startedLog!,
  });

  await new Promise((r) => setTimeout(r, 200));
  assert.equal(
    isPidAlive(startedPid!),
    true,
    'historical AskUserQuestion in the log must not stop a still-running agent',
  );
  assert.equal(
    serviceB.listPendingPermissions('agent-1').length,
    0,
    'answered control_request should not be restored as pending',
  );

  serviceB.stop('agent-1', startedPid, startedLog);
  await attachPromise.catch(() => undefined);
  await runPromise.catch(() => undefined);
  assert.equal(isPidAlive(startedPid!), false);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('stop() kills a detached Claude process', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-stop-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
setInterval(() => {
  process.stdout.write(JSON.stringify({ type: 'ping' }) + '\\n');
}, 100);
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;

  const done = service.runStreaming('agent-stop', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  await new Promise((r) => setTimeout(r, 80));
  assert.ok(pid);
  assert.equal(isPidAlive(pid!), true);

  const stopped = service.stop('agent-stop');
  assert.equal(stopped, true);

  const result = await done;
  assert.equal(result.stopped || result.result === '[stopped]' || !isPidAlive(pid!), true);
  assert.equal(isPidAlive(pid!), false);

  await fs.rm(tmp, { recursive: true, force: true });
});
