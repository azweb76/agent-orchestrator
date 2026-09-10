import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'node:test';
import type { ClaudeRunMonitorHost } from './claude-run-monitor.js';
import type { PermissionDecision } from './permission-protocol.js';
import type { ClaudePermissionRequest, TrackedRun } from './claude-types.js';

const tmpDirs: string[] = [];
const dummyProcs: ChildProcess[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const proc of dummyProcs.splice(0)) {
    try {
      proc.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
});

export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 4000,
  pollMs = 10,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('timed out waiting for condition');
}

/** A disposable, harmless child process — only its pid matters (for isPidAlive checks). */
export function spawnDummyProcess(): ChildProcess {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30);'], {
    stdio: 'ignore',
  });
  dummyProcs.push(child);
  return child;
}

/** Creates a fresh temp dir, cleaned up in `afterEach`. */
export async function tmpDir(prefix = 'claude-run-monitor-'): Promise<string> {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Creates an empty run log in a fresh temp dir and returns its path. */
export async function createRunLog(): Promise<string> {
  const logPath = path.join(await tmpDir(), 'run.log');
  await fsPromises.writeFile(logPath, '');
  return logPath;
}

/** Append one stream-json line per event to the run log. */
export async function appendLogLines(logPath: string, events: unknown[]): Promise<void> {
  const text = events.map((event) => `${JSON.stringify(event)}\n`).join('');
  await fsPromises.appendFile(logPath, text);
}

export function makeTrackedRun(
  overrides: Partial<TrackedRun> & { pid: number; logPath: string },
): TrackedRun {
  return {
    proc: undefined,
    stdin: null,
    stdinFifoPath: null,
    holderPid: null,
    pendingPermissions: new Map(),
    canRespondToPermissions: true,
    permissionMode: 'default',
    lastStreamAt: Date.now(),
    startedAt: Date.now(),
    ...overrides,
  };
}

export interface RecordedPermissionResponse {
  agentId: string;
  requestId: string;
  decision: PermissionDecision;
}

/**
 * Stub ClaudeRunMonitorHost for driving `monitorClaudeRun` in isolation.
 * `closeStdinForRun` never touches real stdin — wire `onCloseStdin` to end the
 * underlying dummy process, mirroring how the real Claude CLI exits once its
 * stdin FIFO is closed.
 */
export class FakeMonitorHost implements ClaudeRunMonitorHost {
  wakeGraceMs: number;
  readonly closeStdinCalls: Array<{ agentId: string; pid: number }> = [];
  readonly reapCalls: Array<{ agentId: string; pid: number }> = [];
  readonly respondCalls: RecordedPermissionResponse[] = [];
  readonly removedRuns: Array<{ agentId: string; pid: number }> = [];
  onCloseStdin?: (agentId: string, pid: number) => void;

  private readonly runs = new Map<string, TrackedRun>();

  constructor(wakeGraceMs = 30) {
    this.wakeGraceMs = wakeGraceMs;
  }

  track(agentId: string, tracked: TrackedRun): void {
    this.runs.set(agentId, tracked);
  }

  getTrackedRun(agentId: string): TrackedRun | undefined {
    return this.runs.get(agentId);
  }

  closeStdinForRun(agentId: string, handlePid: number): void {
    this.closeStdinCalls.push({ agentId, pid: handlePid });
    this.onCloseStdin?.(agentId, handlePid);
  }

  reapAfterResult(agentId: string, handlePid: number): void {
    this.reapCalls.push({ agentId, pid: handlePid });
  }

  respondToPermission(
    agentId: string,
    requestId: string,
    decision: PermissionDecision,
    options: { requirePending?: boolean } = {},
  ): boolean {
    const tracked = this.runs.get(agentId);
    // Mirrors ClaudeService.respondToPermission's real gate (claude-service.ts):
    // no reply can be sent once stdin is unavailable.
    if (!tracked || !tracked.canRespondToPermissions) return false;
    const requirePending = options.requirePending !== false;
    if (requirePending && !tracked.pendingPermissions.has(requestId)) return false;
    this.respondCalls.push({ agentId, requestId, decision });
    tracked.pendingPermissions.delete(requestId);
    return true;
  }

  removeTrackedRunIfPid(agentId: string, handlePid: number): void {
    const tracked = this.runs.get(agentId);
    if (tracked?.pid === handlePid) {
      this.runs.delete(agentId);
      this.removedRuns.push({ agentId, pid: handlePid });
    }
  }
}

/**
 * Wires `host.onCloseStdin` to kill `pid`, mirroring how the real Claude CLI
 * exits once its stdin FIFO is closed — lets `followClaudeLog` see the
 * process die and end the test's `monitorClaudeRun` call.
 */
export function killPidOnCloseStdin(host: FakeMonitorHost, pid: number): void {
  host.onCloseStdin = () => {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  };
}

export function collectPermissionRequests(): {
  requests: ClaudePermissionRequest[];
  onPermissionRequest: (request: ClaudePermissionRequest) => void;
} {
  const requests: ClaudePermissionRequest[] = [];
  return { requests, onPermissionRequest: (request) => requests.push(request) };
}
