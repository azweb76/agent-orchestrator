import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ClaudeService,
  isPidAlive,
  killProcessTree,
} from './git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function writeFakeClaude(binPath: string, script: string): Promise<void> {
  await fs.writeFile(binPath, script, { mode: 0o755 });
}

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

test('killProcessTree terminates process groups started detached', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      'setInterval(() => {}, 1000);',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  assert.ok(child.pid);
  assert.equal(isPidAlive(child.pid), true);
  killProcessTree(child.pid);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(isPidAlive(child.pid), false);
});
