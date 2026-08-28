import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import {
  buildClaudeArgs,
  buildPromptWithImages,
  buildPromptWithMentionContext,
  buildStreamUserMessage,
} from './claude-args.js';
import {
  cleanupStdinSidecars,
  createStdinFifo,
  isPidAlive,
  killProcessTree,
  killStdinHolder,
  openFifoWriteStream,
  readHolderPid,
  reopenStdinFromLog,
  scheduleForceKill,
  spawnStdinHolder,
  stdinPathsForLog,
  waitForSpawn,
} from './claude-process.js';
import {
  monitorClaudeRun,
  type ClaudeRunMonitorHost,
} from './claude-run-monitor.js';
import {
  buildControlResponse,
  type PermissionDecision,
} from './permission-protocol.js';
import type {
  ClaudePermissionMode,
  ClaudePermissionRequest,
  ClaudeRunHandle,
  ClaudeRunOptions,
  ClaudeRunResult,
  TrackedRun,
} from './claude-types.js';

const execFileAsync = promisify(execFile);

export class ClaudeService implements ClaudeRunMonitorHost {
  private running = new Map<string, TrackedRun>();
  /**
   * After a deferred `result` (background task still running) settles, how long
   * to wait for the CLI to wake the model before closing the run anyway.
   */
  wakeGraceMs: number;

  constructor(
    private claudeBin: string,
    private runsDir: string,
    options: { wakeGraceMs?: number } = {},
  ) {
    this.wakeGraceMs = options.wakeGraceMs ?? 20_000;
    mkdirSync(this.runsDir, { recursive: true });
  }

  isAvailable(): boolean {
    return Boolean(this.claudeBin);
  }

  getBin(): string {
    return this.claudeBin;
  }

  setBin(bin: string): void {
    this.claudeBin = bin;
  }

  getRunningProcess(agentId: string): TrackedRun | undefined {
    return this.running.get(agentId);
  }

  getTrackedRun(agentId: string): TrackedRun | undefined {
    return this.running.get(agentId);
  }

  removeTrackedRunIfPid(agentId: string, handlePid: number): void {
    const tracked = this.running.get(agentId);
    if (tracked?.pid === handlePid) {
      this.running.delete(agentId);
    }
  }

  listPendingPermissions(agentId: string): ClaudePermissionRequest[] {
    const tracked = this.running.get(agentId);
    if (!tracked) return [];
    return [...tracked.pendingPermissions.values()];
  }

  async checkInstalled(): Promise<boolean> {
    try {
      await execFileAsync(this.claudeBin, ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Explicitly stop an agent's Claude process. App shutdown must NOT call this —
   * detached runs are meant to outlive the orchestrator process.
   */
  stop(
    agentId: string,
    pidFallback?: number | null,
    logPathFallback?: string | null,
  ): boolean {
    const tracked = this.running.get(agentId);
    const pid = tracked?.pid ?? pidFallback ?? null;
    const logPath = tracked?.logPath ?? logPathFallback ?? null;
    try {
      tracked?.stdin?.end();
    } catch {
      // ignore
    }
    killStdinHolder(tracked?.holderPid ?? (logPath ? readHolderPid(logPath) : null));
    cleanupStdinSidecars(logPath);
    this.running.delete(agentId);
    if (pid == null) return false;
    killProcessTree(pid);
    scheduleForceKill(pid);
    return true;
  }

  /** Drop in-memory handles without killing processes (used on app shutdown). */
  releaseAll(): void {
    for (const tracked of this.running.values()) {
      try {
        // Close our write stream only. The stdin holder keeps the FIFO open so
        // Claude does not see EOF and can still receive permission replies after restart.
        tracked.stdin?.end();
      } catch {
        // ignore
      }
      tracked.stdin = null;
      tracked.canRespondToPermissions = false;
    }
    this.running.clear();
  }

  closeStdinForRun(agentId: string, handlePid: number): void {
    const tracked = this.running.get(agentId);
    if (!tracked || tracked.pid !== handlePid) return;
    try {
      tracked.stdin?.end();
    } catch {
      // ignore
    }
    tracked.stdin = null;
    tracked.canRespondToPermissions = false;
    killStdinHolder(tracked.holderPid);
    tracked.holderPid = null;
  }

  /**
   * Stream-json print mode only exits on stdin EOF, and some CLI versions hang
   * even after a result event. Close stdin, then SIGTERM if the pid lingers.
   */
  reapAfterResult(agentId: string, handlePid: number, waitMs = 1500): void {
    const timer = setTimeout(() => {
      const tracked = this.running.get(agentId);
      if (!tracked || tracked.pid !== handlePid) return;
      if (!isPidAlive(handlePid)) return;
      killProcessTree(handlePid);
      scheduleForceKill(handlePid);
    }, waitMs);
    timer.unref();
  }

  /**
   * Reply to a pending can_use_tool control request over Claude's stdin.
   * Returns false when the request is unknown or stdin is unavailable.
   */
  respondToPermission(
    agentId: string,
    requestId: string,
    decision: PermissionDecision,
    options: { requirePending?: boolean } = {},
  ): boolean {
    const tracked = this.running.get(agentId);
    if (!tracked?.canRespondToPermissions || !tracked.stdin) return false;
    const requirePending = options.requirePending !== false;
    if (requirePending && !tracked.pendingPermissions.has(requestId)) return false;

    const payload = `${JSON.stringify(buildControlResponse(requestId, decision))}\n`;
    try {
      const ok = tracked.stdin.write(payload);
      if (!ok) {
        // Backpressure — still delivered asynchronously; continue.
      }
      tracked.pendingPermissions.delete(requestId);
      return true;
    } catch {
      return false;
    }
  }

  /** Drop a pending permission without writing a control response (e.g. Build kills the run). */
  dismissPermission(agentId: string, requestId: string): boolean {
    const tracked = this.running.get(agentId);
    if (!tracked) return false;
    return tracked.pendingPermissions.delete(requestId);
  }

  async runStreaming(agentId: string, options: ClaudeRunOptions): Promise<ClaudeRunResult> {
    if (this.running.has(agentId)) {
      throw new Error('This chat session already has a running Claude process');
    }

    const prompt = buildPromptWithMentionContext(
      buildPromptWithImages(options.prompt, options.imagePaths ?? []),
      options.mentionContext ?? '',
    );
    const permissionMode = options.permissionMode ?? 'plan';
    const args = buildClaudeArgs({
      model: options.model,
      effort: options.effort,
      sessionId: options.sessionId,
      allowedTools: options.allowedTools,
      permissionMode,
    });

    const logPath = path.join(this.runsDir, `${agentId}-${Date.now()}.log`);
    const { fifoPath, holderPidPath } = stdinPathsForLog(logPath);
    createStdinFifo(fifoPath);

    // Keep the FIFO unblocked during setup (Linux O_RDWR does not wait for a peer).
    const readyFd = openSync(fifoPath, 'r+');
    let holderPid: number;
    try {
      holderPid = spawnStdinHolder(fifoPath, holderPidPath);
    } catch (error) {
      closeSync(readyFd);
      cleanupStdinSidecars(logPath);
      throw error;
    }

    const outFd = openSync(logPath, 'w');
    const stdinReadFd = openSync(fifoPath, 'r');

    let proc;
    try {
      proc = spawn(this.claudeBin, args, {
        cwd: options.cwd,
        env: process.env,
        detached: true,
        stdio: [stdinReadFd, outFd, outFd],
      });
    } finally {
      closeSync(outFd);
      closeSync(stdinReadFd);
    }

    // Listen before the next tick so a missing binary cannot become an uncaughtException.
    const spawned = waitForSpawn(proc);
    proc.unref();

    const failToStart = (error?: unknown): never => {
      closeSync(readyFd);
      if (proc.pid != null) {
        try {
          killProcessTree(proc.pid);
        } catch {
          // ignore
        }
      }
      killStdinHolder(holderPid);
      cleanupStdinSidecars(logPath);
      const detail = error instanceof Error ? error.message : 'unknown spawn error';
      throw new Error(`Failed to start Claude process: ${detail}`);
    };

    const spawnedPid = proc.pid;
    if (spawnedPid == null) {
      try {
        await spawned;
      } catch (error) {
        failToStart(error);
      }
      failToStart();
    }
    const pid: number = spawnedPid as number;

    let stdin: NodeJS.WritableStream | undefined;
    try {
      stdin = openFifoWriteStream(fifoPath);
      stdin.write(buildStreamUserMessage(prompt));
    } catch (error) {
      closeSync(readyFd);
      try {
        stdin?.end();
      } catch {
        // ignore
      }
      killProcessTree(pid);
      killStdinHolder(holderPid);
      cleanupStdinSidecars(logPath);
      throw error instanceof Error ? error : new Error('Failed to write prompt to Claude stdin');
    }

    closeSync(readyFd);

    const handle: ClaudeRunHandle = { pid, logPath };
    this.running.set(agentId, {
      ...handle,
      proc,
      stdin,
      stdinFifoPath: fifoPath,
      holderPid,
      pendingPermissions: new Map(),
      canRespondToPermissions: true,
      permissionMode,
    });
    options.onStarted?.(handle);

    try {
      await spawned;
    } catch (error) {
      try {
        stdin.end();
      } catch {
        // ignore
      }
      this.running.delete(agentId);
      try {
        killProcessTree(pid);
      } catch {
        // ignore
      }
      killStdinHolder(holderPid);
      cleanupStdinSidecars(logPath);
      const detail = error instanceof Error ? error.message : 'unknown spawn error';
      throw new Error(`Failed to start Claude process: ${detail}`, { cause: error });
    }

    return monitorClaudeRun(this, agentId, handle, options.sessionId ?? null, options, options.signal);
  }

  /**
   * Re-attach to a Claude process that outlived a previous orchestrator instance.
   * Stdin is restored via the named FIFO + holder process so AskUserQuestion /
   * permission prompts can still be answered after a backend restart.
   */
  async attachToRun(
    agentId: string,
    handle: ClaudeRunHandle,
    options: {
      sessionId?: string | null;
      permissionMode?: ClaudePermissionMode;
      onEvent?: ClaudeRunOptions['onEvent'];
      onPermissionRequest?: ClaudeRunOptions['onPermissionRequest'];
      onCatchUp?: () => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<ClaudeRunResult> {
    const reopened = reopenStdinFromLog(handle.logPath);
    this.running.set(agentId, {
      pid: handle.pid,
      logPath: handle.logPath,
      stdin: reopened.stdin,
      stdinFifoPath: reopened.fifoPath,
      holderPid: reopened.holderPid,
      pendingPermissions: new Map(),
      canRespondToPermissions: reopened.canRespond,
      permissionMode: options.permissionMode ?? 'plan',
    });
    return monitorClaudeRun(this, agentId, handle, options.sessionId ?? null, options, options.signal);
  }
}
