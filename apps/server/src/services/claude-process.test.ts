import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupStdinSidecars,
  createStdinFifo,
  isPidAlive,
  killStdinHolder,
  readHolderPid,
  reopenStdinFromLog,
  spawnStdinHolder,
  stdinPathsForLog,
} from './claude-process.js';
import { spawnDummyProcess, tmpDir, waitFor } from './claude-run-monitor.test-helpers.js';

async function tmpLogPath(): Promise<string> {
  return path.join(await tmpDir('claude-process-'), 'run.log');
}

test('stdinPathsForLog derives sidecar paths from the log path', () => {
  const { fifoPath, holderPidPath } = stdinPathsForLog('/tmp/runs/agent-1-123.log');
  assert.equal(fifoPath, '/tmp/runs/agent-1-123.stdin');
  assert.equal(holderPidPath, '/tmp/runs/agent-1-123.holder.pid');
});

test('createStdinFifo creates a FIFO, replacing anything already at that path', async () => {
  const logPath = await tmpLogPath();
  const { fifoPath } = stdinPathsForLog(logPath);

  await fsPromises.writeFile(fifoPath, 'stale non-fifo file');
  assert.equal(fs.statSync(fifoPath).isFIFO(), false);

  createStdinFifo(fifoPath);
  assert.equal(fs.statSync(fifoPath).isFIFO(), true);

  cleanupStdinSidecars(logPath);
});

test('spawnStdinHolder keeps the FIFO open; killStdinHolder reaps it', async () => {
  const logPath = await tmpLogPath();
  const { fifoPath, holderPidPath } = stdinPathsForLog(logPath);
  createStdinFifo(fifoPath);

  const holderPid = spawnStdinHolder(fifoPath, holderPidPath);
  assert.equal(isPidAlive(holderPid), true);
  assert.equal(readHolderPid(logPath), holderPid);

  killStdinHolder(holderPid);
  await waitFor(() => !isPidAlive(holderPid), 2000);

  cleanupStdinSidecars(logPath);
});

test('cleanupStdinSidecars removes the FIFO and holder pid file (and tolerates their absence)', async () => {
  const logPath = await tmpLogPath();
  const { fifoPath, holderPidPath } = stdinPathsForLog(logPath);
  createStdinFifo(fifoPath);
  await fsPromises.writeFile(holderPidPath, '4242', 'utf8');

  cleanupStdinSidecars(logPath);
  assert.equal(fs.existsSync(fifoPath), false);
  assert.equal(fs.existsSync(holderPidPath), false);

  // Calling again (nothing left to remove) must not throw.
  assert.doesNotThrow(() => cleanupStdinSidecars(logPath));
  assert.doesNotThrow(() => cleanupStdinSidecars(null));
});

test('reopenStdinFromLog reports no fifo when the run was never started', async () => {
  const logPath = await tmpLogPath();
  const reopened = reopenStdinFromLog(logPath);
  assert.deepEqual(reopened, { stdin: null, holderPid: null, fifoPath: null, canRespond: false });
});

test('reopenStdinFromLog returns a writable stream while the holder is alive', async () => {
  const logPath = await tmpLogPath();
  const { fifoPath, holderPidPath } = stdinPathsForLog(logPath);
  createStdinFifo(fifoPath);
  const holderPid = spawnStdinHolder(fifoPath, holderPidPath);

  const reopened = reopenStdinFromLog(logPath);
  assert.equal(reopened.canRespond, true);
  assert.equal(reopened.holderPid, holderPid);
  assert.ok(reopened.fifoPath);
  assert.ok(reopened.stdin);
  assert.doesNotThrow(() => reopened.stdin?.write('{"type":"ping"}\n'));
  reopened.stdin?.end();

  killStdinHolder(holderPid);
  await waitFor(() => !isPidAlive(holderPid), 2000);
  cleanupStdinSidecars(logPath);
});

test('reopenStdinFromLog cannot respond once the holder process has died', async () => {
  const logPath = await tmpLogPath();
  const { fifoPath, holderPidPath } = stdinPathsForLog(logPath);
  createStdinFifo(fifoPath);

  // Write a pid that is guaranteed to be dead by the time we check it, simulating
  // an orchestrator restart landing after the holder was reaped some other way.
  const deadProc = spawnDummyProcess();
  const deadPid = deadProc.pid!;
  deadProc.kill('SIGKILL');
  await waitFor(() => !isPidAlive(deadPid), 2000);
  await fsPromises.writeFile(holderPidPath, String(deadPid), 'utf8');

  const reopened = reopenStdinFromLog(logPath);
  assert.equal(reopened.canRespond, false);
  assert.equal(reopened.stdin, null);
  assert.equal(reopened.holderPid, deadPid);

  cleanupStdinSidecars(logPath);
});
