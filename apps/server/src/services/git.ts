import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractPlanFilePath,
  extractPlanFilePathsFromLog,
} from '@agent-orchestrator/shared';
import {
  allowedToolsForPermissionMode,
  buildControlResponse,
  parsePermissionRequest,
  shouldAutoAllowToolPermission,
  type PermissionDecision,
} from './permission-protocol.js';

const execFileAsync = promisify(execFile);

/** @deprecated Prefer allowedToolsForPermissionMode — kept for tests/compat. */
export const DEFAULT_ALLOWED_TOOLS = allowedToolsForPermissionMode('plan');

/** Interactive tools available for plan-mode sessions (never auto-approved). */
export const INTERACTIVE_TOOLS = 'AskUserQuestion,ExitPlanMode';

export class GitService {
  async clone(url: string, targetPath: string): Promise<string> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await execFileAsync('git', ['clone', url, targetPath], { maxBuffer: 10 * 1024 * 1024 });
    return targetPath;
  }

  async getDefaultBranch(repoPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'symbolic-ref', 'refs/remotes/origin/HEAD']);
    return stdout.trim().replace('refs/remotes/origin/', '');
  }

  async fetch(repoPath: string, remote = 'origin'): Promise<void> {
    await execFileAsync('git', ['-C', repoPath, 'fetch', remote, '--prune'], {
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  async addWorktree(
    mainRepoPath: string,
    worktreePath: string,
    branch: string,
    options: { createBranch?: boolean; startRef?: string } = {},
  ): Promise<void> {
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });
    const args = ['-C', mainRepoPath, 'worktree', 'add'];
    if (options.createBranch) {
      const startRef = options.startRef ?? branch;
      args.push('-b', branch, worktreePath, startRef);
    } else {
      args.push(worktreePath, branch);
    }
    await execFileAsync('git', args, { maxBuffer: 10 * 1024 * 1024 });
  }

  /**
   * Fetch a GitHub PR head into a remote-tracking ref, then create/update
   * `localBranch` to match — without fetching directly into a checked-out branch
   * (which Git refuses when the branch is used by a worktree).
   */
  async fetchPullRequest(mainRepoPath: string, prNumber: number, localBranch: string): Promise<void> {
    const pullRef = `refs/remotes/pull/${prNumber}/head`;
    await execFileAsync(
      'git',
      ['-C', mainRepoPath, 'fetch', 'origin', `+pull/${prNumber}/head:${pullRef}`],
      { maxBuffer: 10 * 1024 * 1024 },
    );

    const checkedOutAt = await this.getWorktreePathForBranch(mainRepoPath, localBranch);
    if (checkedOutAt) {
      // Cannot move refs/heads/<branch> while it is checked out; caller should reuse
      // the existing worktree. Leave the branch tip as-is.
      return;
    }

    await execFileAsync('git', ['-C', mainRepoPath, 'branch', '-f', localBranch, pullRef], {
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  /** Return the worktree path that has `branch` checked out, if any. */
  async getWorktreePathForBranch(mainRepoPath: string, branch: string): Promise<string | null> {
    const { stdout } = await execFileAsync('git', ['-C', mainRepoPath, 'worktree', 'list', '--porcelain'], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const want = `refs/heads/${branch}`;
    let currentPath: string | null = null;
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length);
      } else if (line.startsWith('branch ') && line.slice('branch '.length) === want) {
        return currentPath;
      } else if (line === '') {
        currentPath = null;
      }
    }
    return null;
  }

  async removeWorktree(mainRepoPath: string, worktreePath: string): Promise<void> {
    try {
      await execFileAsync('git', ['-C', mainRepoPath, 'worktree', 'remove', '--force', worktreePath]);
    } catch {
      await fs.rm(worktreePath, { recursive: true, force: true });
    }
  }

  /**
   * Diff the worktree against `baseRef` (default HEAD = pending uncommitted changes).
   * When comparing to HEAD, untracked files are included so new agent-created files appear.
   */
  async getDiff(worktreePath: string, baseRef?: string): Promise<{ stat: string; patch: string }> {
    const base = baseRef ?? 'HEAD';
    const [statResult, patchResult] = await Promise.all([
      execFileAsync('git', ['-C', worktreePath, 'diff', '--stat', base], { maxBuffer: 10 * 1024 * 1024 }),
      execFileAsync('git', ['-C', worktreePath, 'diff', base], { maxBuffer: 20 * 1024 * 1024 }),
    ]);

    let stat = statResult.stdout.trim();
    let patch = patchResult.stdout;

    if (base === 'HEAD') {
      const untracked = await this.getUntrackedDiff(worktreePath);
      if (untracked.patch) {
        patch = patch ? `${patch}${patch.endsWith('\n') ? '' : '\n'}${untracked.patch}` : untracked.patch;
        const untrackedStat = untracked.paths
          .map((filePath) => ` ${filePath} | Untracked`)
          .join('\n');
        stat = [stat, untrackedStat, untracked.paths.length ? ` ${untracked.paths.length} untracked` : '']
          .filter(Boolean)
          .join('\n');
      }
    }

    return { stat, patch };
  }

  /** Build a unified diff for untracked (and not ignored) files. */
  private async getUntrackedDiff(
    worktreePath: string,
  ): Promise<{ patch: string; paths: string[] }> {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', worktreePath, 'ls-files', '--others', '--exclude-standard', '-z'],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const paths = stdout.split('\0').map((p) => p.trim()).filter(Boolean);
    if (paths.length === 0) return { patch: '', paths: [] };

    const chunks: string[] = [];
    for (const filePath of paths) {
      try {
        const { stdout: fileDiff } = await execFileAsync(
          'git',
          ['-C', worktreePath, 'diff', '--no-index', '--', '/dev/null', filePath],
          { maxBuffer: 10 * 1024 * 1024 },
        );
        if (fileDiff) chunks.push(fileDiff);
      } catch (err) {
        // git diff --no-index exits 1 when files differ; stdout still has the patch.
        const execErr = err as { stdout?: string; code?: number };
        if (typeof execErr.stdout === 'string' && execErr.stdout) {
          chunks.push(execErr.stdout);
        }
      }
    }
    return { patch: chunks.join(''), paths };
  }

  async getCurrentBranch(worktreePath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', worktreePath, 'branch', '--show-current']);
    return stdout.trim();
  }

  async hasChanges(worktreePath: string): Promise<boolean> {
    const { stdout } = await execFileAsync('git', ['-C', worktreePath, 'status', '--porcelain']);
    return stdout.trim().length > 0;
  }

  async pushBranch(worktreePath: string, branch: string): Promise<void> {
    await execFileAsync('git', ['-C', worktreePath, 'push', '-u', 'origin', branch], {
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  async commitAll(worktreePath: string, message: string): Promise<void> {
    await execFileAsync('git', ['-C', worktreePath, 'add', '-A']);
    await execFileAsync('git', ['-C', worktreePath, 'commit', '-m', message]);
  }
}

export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  /** Present on nested subagent messages; a top-level turn result omits this. */
  parent_tool_use_id?: string;
  event?: {
    delta?: {
      type?: string;
      text?: string;
    };
  };
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  [key: string]: unknown;
}

export type ClaudePermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions';

export interface ClaudePermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseId?: string;
}

export interface ClaudeEventMeta {
  /** True while catching up on log bytes written before this monitor attached. */
  replay: boolean;
}

export interface ClaudeRunOptions {
  cwd: string;
  prompt: string;
  model?: string;
  /** Claude Code `--effort` level. */
  effort?: string;
  sessionId?: string | null;
  allowedTools?: string;
  permissionMode?: ClaudePermissionMode;
  /** Absolute image paths to reference in the prompt for Claude's Read tool. */
  imagePaths?: string[];
  onEvent?: (event: ClaudeStreamEvent, meta?: ClaudeEventMeta) => void;
  /** Interactive tool permission / AskUserQuestion / ExitPlanMode requests. */
  onPermissionRequest?: (request: ClaudePermissionRequest) => void;
  /** Called after historical log lines have been replayed (reattach catch-up). */
  onCatchUp?: () => void;
  /** Called once the detached process has been spawned (pid + log path). */
  onStarted?: (handle: ClaudeRunHandle) => void;
  /**
   * When aborted, the Claude process is killed. Do not wire this to HTTP disconnect /
   * server shutdown — only to explicit stop requests.
   */
  signal?: AbortSignal;
}

export function buildClaudeArgs(options: {
  model?: string;
  effort?: string;
  sessionId?: string | null;
  allowedTools?: string;
  permissionMode?: ClaudePermissionMode;
  defaultAllowedTools?: string;
}): string[] {
  const permissionMode = options.permissionMode ?? 'plan';
  // Print mode is required for --output-format/--input-format/--include-partial-messages.
  // Without --print the CLI can emit an assistant reply and then wait on stdin forever
  // (no result event, process never exits) — the chat UI stays "Running".
  // Do not pass the prompt as a --print argument: write it as a stream-json user
  // message on stdin so control_response replies share the same channel.
  //
  // --allowedTools auto-approves without prompting. Never list AskUserQuestion /
  // ExitPlanMode here or the agent page cannot collect answers / plan approval.
  // Omit --tools so all built-ins (including interactive plan tools) stay available.
  const allowedTools =
    options.allowedTools ??
    options.defaultAllowedTools ??
    allowedToolsForPermissionMode(permissionMode);
  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    '--allowedTools',
    allowedTools,
  ];

  if (permissionMode === 'bypassPermissions') {
    // Prefer --permission-mode so AskUserQuestion / ExitPlanMode still reach stdio prompts.
    // --dangerously-skip-permissions can suppress interactive tool gating.
    args.push('--permission-mode', 'bypassPermissions');
  } else {
    args.push('--permission-mode', permissionMode);
  }

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.effort) {
    args.push('--effort', options.effort);
  }

  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }

  return args;
}

export function buildPromptWithImages(prompt: string, imagePaths: string[]): string {
  if (imagePaths.length === 0) return prompt;
  const list = imagePaths.map((p) => `- ${p}`).join('\n');
  return `${prompt}\n\nAttached images (read these files with the Read tool):\n${list}`;
}

/** Initial user message written to Claude stdin in stream-json mode. */
export function buildStreamUserMessage(prompt: string): string {
  return `${JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: prompt,
    },
  })}\n`;
}

export interface ClaudeRunHandle {
  pid: number;
  logPath: string;
}

export interface ClaudeRunResult {
  result: string;
  sessionId: string | null;
  events: ClaudeStreamEvent[];
  stopped: boolean;
}

interface TrackedRun {
  pid: number;
  logPath: string;
  proc?: ChildProcess;
  /** Write end for control_response / user messages. Reopened after orchestrator restart. */
  stdin: NodeJS.WritableStream | null;
  stdinFifoPath: string | null;
  /** Detached process that keeps the stdin FIFO open across orchestrator restarts. */
  holderPid: number | null;
  pendingPermissions: Map<string, ClaudePermissionRequest>;
  /** True when stdin is available for interactive permission replies. */
  canRespondToPermissions: boolean;
  /** Agent permission mode for this run (controls auto-allow vs UI prompts). */
  permissionMode: ClaudePermissionMode;
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalProcessTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited
    }
  }
}

/** Kill a detached Claude process group (falls back to the single pid). */
export function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  signalProcessTree(pid, signal);
}

/** If SIGTERM did not reap the process, SIGKILL after a short delay. */
function scheduleForceKill(pid: number, waitMs = 1000): void {
  const timer = setTimeout(() => {
    if (!isPidAlive(pid)) return;
    signalProcessTree(pid, 'SIGKILL');
  }, waitMs);
  timer.unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForSpawn(proc: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const swallowLaterErrors = () => {
      proc.on('error', () => {
        // Detached stdio errors must not crash the orchestrator.
      });
    };
    const onError = (error: Error) => {
      proc.off('spawn', onSpawn);
      swallowLaterErrors();
      reject(error);
    };
    const onSpawn = () => {
      proc.off('error', onError);
      swallowLaterErrors();
      resolve();
    };
    proc.once('error', onError);
    proc.once('spawn', onSpawn);
  });
}

/** Sidecar FIFO + holder pid used so Claude stdin survives orchestrator restart. */
export function stdinPathsForLog(logPath: string): { fifoPath: string; holderPidPath: string } {
  const base = logPath.replace(/\.log$/, '');
  return {
    fifoPath: `${base}.stdin`,
    holderPidPath: `${base}.holder.pid`,
  };
}

/**
 * Detached Node process that holds the stdin FIFO open (O_RDWR) so closing the
 * orchestrator's write stream — or exiting the orchestrator — does not EOF Claude.
 */
const STDIN_HOLDER_SCRIPT = `
const fs = require('fs');
const fd = fs.openSync(process.argv[1], 'r+');
setInterval(() => {}, 1 << 30);
function shutdown() {
  try { fs.closeSync(fd); } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
`;

function createStdinFifo(fifoPath: string): void {
  try {
    unlinkSync(fifoPath);
  } catch {
    // ignore
  }
  execFileSync('mkfifo', [fifoPath], { stdio: 'ignore' });
}

function spawnStdinHolder(fifoPath: string, holderPidPath: string): number {
  const child = spawn(process.execPath, ['-e', STDIN_HOLDER_SCRIPT.trim(), fifoPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  if (child.pid == null) {
    throw new Error('Failed to start stdin holder');
  }
  writeFileSync(holderPidPath, String(child.pid), 'utf8');
  return child.pid;
}

function readHolderPid(logPath: string): number | null {
  try {
    const raw = readFileSync(stdinPathsForLog(logPath).holderPidPath, 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function killStdinHolder(holderPid: number | null | undefined): void {
  if (holderPid == null) return;
  try {
    process.kill(holderPid, 'SIGTERM');
  } catch {
    // already gone
  }
  scheduleForceKill(holderPid);
}

function cleanupStdinSidecars(logPath: string | null | undefined): void {
  if (!logPath) return;
  const { fifoPath, holderPidPath } = stdinPathsForLog(logPath);
  try {
    unlinkSync(fifoPath);
  } catch {
    // ignore
  }
  try {
    unlinkSync(holderPidPath);
  } catch {
    // ignore
  }
}

function openFifoWriteStream(fifoPath: string): NodeJS.WritableStream {
  const fd = openSync(fifoPath, 'w');
  const stream = createWriteStream(fifoPath, { fd, autoClose: true });
  stream.on('error', () => {
    // EPIPE if Claude already exited
  });
  return stream;
}

function reopenStdinFromLog(logPath: string): {
  stdin: NodeJS.WritableStream | null;
  holderPid: number | null;
  fifoPath: string | null;
  canRespond: boolean;
} {
  const { fifoPath } = stdinPathsForLog(logPath);
  const holderPid = readHolderPid(logPath);
  if (!existsSync(fifoPath)) {
    return { stdin: null, holderPid, fifoPath: null, canRespond: false };
  }
  const holderAlive = holderPid != null && isPidAlive(holderPid);
  if (!holderAlive) {
    return { stdin: null, holderPid, fifoPath, canRespond: false };
  }
  try {
    return {
      stdin: openFifoWriteStream(fifoPath),
      holderPid,
      fifoPath,
      canRespond: true,
    };
  } catch {
    return { stdin: null, holderPid, fifoPath, canRespond: false };
  }
}

/**
 * Read complete JSON lines already in a run log. `position` is the byte offset
 * to resume from (after the last newline), so a trailing partial line is not skipped.
 */
export async function readClaudeLogSnapshot(
  logPath: string,
): Promise<{ lines: string[]; position: number }> {
  try {
    const content = await fs.readFile(logPath, 'utf8');
    const lastNewline = content.lastIndexOf('\n');
    if (lastNewline < 0) return { lines: [], position: 0 };
    const complete = content.slice(0, lastNewline + 1);
    const lines = complete.split('\n').filter((line) => line.trim());
    return { lines, position: complete.length };
  } catch {
    return { lines: [], position: 0 };
  }
}

/**
 * Follow a Claude stream-json log until the process exits.
 */
export async function followClaudeLog(
  pid: number,
  logPath: string,
  onLine: (line: string) => void,
  options: { pollMs?: number; signal?: AbortSignal; startPosition?: number } = {},
): Promise<void> {
  const pollMs = options.pollMs ?? 50;
  let position = options.startPosition ?? 0;
  let buffer = '';

  while (!options.signal?.aborted) {
    const alive = isPidAlive(pid);

    try {
      const handle = await fs.open(logPath, 'r');
      try {
        const stat = await handle.stat();
        if (stat.size > position) {
          const length = stat.size - position;
          const chunk = Buffer.alloc(length);
          const { bytesRead } = await handle.read(chunk, 0, length, position);
          position += bytesRead;
          buffer += chunk.subarray(0, bytesRead).toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.trim()) onLine(line);
          }
        }
      } finally {
        await handle.close();
      }
    } catch {
      // Log may not exist yet right after spawn
    }

    if (!alive) {
      if (buffer.trim()) onLine(buffer);
      break;
    }

    await sleep(pollMs);
  }
}

export class ClaudeService {
  private running = new Map<string, TrackedRun>();

  constructor(
    private claudeBin: string,
    private runsDir: string,
  ) {
    mkdirSync(this.runsDir, { recursive: true });
  }

  isAvailable(): boolean {
    return Boolean(this.claudeBin);
  }

  getRunningProcess(agentId: string): TrackedRun | undefined {
    return this.running.get(agentId);
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

  private closeStdinForRun(agentId: string, handlePid: number): void {
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
  private reapAfterResult(agentId: string, handlePid: number, waitMs = 1500): void {
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

    const prompt = buildPromptWithImages(options.prompt, options.imagePaths ?? []);
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

    let proc: ChildProcess;
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
      throw new Error(`Failed to start Claude process: ${detail}`);
    }

    return this.monitorRun(agentId, handle, options.sessionId ?? null, options, options.signal);
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
      onEvent?: (event: ClaudeStreamEvent, meta?: ClaudeEventMeta) => void;
      onPermissionRequest?: (request: ClaudePermissionRequest) => void;
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
    return this.monitorRun(agentId, handle, options.sessionId ?? null, options, options.signal);
  }

  private async monitorRun(
    agentId: string,
    handle: ClaudeRunHandle,
    initialSessionId: string | null,
    options: {
      onEvent?: (event: ClaudeStreamEvent, meta?: ClaudeEventMeta) => void;
      onPermissionRequest?: (request: ClaudePermissionRequest) => void;
      onCatchUp?: () => void;
    },
    signal?: AbortSignal,
  ): Promise<ClaudeRunResult> {
    const events: ClaudeStreamEvent[] = [];
    let result = '';
    let sessionId: string | null = initialSessionId;
    let stopped = false;

    const handleAbort = () => {
      stopped = true;
      killProcessTree(handle.pid);
    };
    signal?.addEventListener('abort', handleAbort);
    if (signal?.aborted) {
      handleAbort();
    }

    const processLine = (line: string, replay: boolean) => {
      try {
        const event = JSON.parse(line) as ClaudeStreamEvent;
        events.push(event);
        options.onEvent?.(event, { replay });

        if (event.session_id) {
          sessionId = event.session_id;
        }

        if (event.type === 'result' && !event.parent_tool_use_id) {
          if (typeof event.result === 'string') {
            result = event.result;
          }
          const trackedForResult = this.running.get(agentId);
          if (trackedForResult?.pid === handle.pid) {
            trackedForResult.pendingPermissions.clear();
            // End stdin after the turn completes so the CLI can exit (stream-json keeps
            // the process open while stdin is still writable). Only touch this run —
            // Build may already have started a replacement process under the same agentId.
            this.closeStdinForRun(agentId, handle.pid);
            this.reapAfterResult(agentId, handle.pid);
          }
        }

        this.handleControlEvent(agentId, handle.pid, event as Record<string, unknown>, options, {
          replay,
        });
      } catch {
        // ignore malformed lines
      }
    };

    try {
      const snapshot = await readClaudeLogSnapshot(handle.logPath);
      for (const line of snapshot.lines) {
        processLine(line, true);
      }
      this.flushReplayedPermissions(agentId, handle.pid, options);
      options.onCatchUp?.();

      await followClaudeLog(handle.pid, handle.logPath, (line) => processLine(line, false), {
        startPosition: snapshot.position,
        signal,
      });
    } finally {
      signal?.removeEventListener('abort', handleAbort);
      const tracked = this.running.get(agentId);
      if (tracked?.pid === handle.pid) {
        this.closeStdinForRun(agentId, handle.pid);
        cleanupStdinSidecars(handle.logPath);
        this.running.delete(agentId);
      }
    }

    if (stopped && !result) {
      return { result: '[stopped]', sessionId, events, stopped: true };
    }

    return { result, sessionId, events, stopped };
  }

  private stashPermissionRequest(
    tracked: TrackedRun,
    parsed: {
      requestId: string;
      toolName: string;
      input: Record<string, unknown>;
      toolUseId?: string;
    },
  ): ClaudePermissionRequest {
    const input = enrichPermissionInput(parsed.toolName, parsed.input, {
      logPath: tracked.logPath,
    });
    const request: ClaudePermissionRequest = {
      requestId: parsed.requestId,
      toolName: parsed.toolName,
      input,
      toolUseId: parsed.toolUseId,
    };
    tracked.pendingPermissions.clear();
    tracked.pendingPermissions.set(parsed.requestId, request);
    return request;
  }

  /**
   * After log catch-up, emit still-pending prompts (or auto-allow ones that never
   * got a response because the previous orchestrator process died).
   */
  private flushReplayedPermissions(
    agentId: string,
    handlePid: number,
    options: {
      onPermissionRequest?: (request: ClaudePermissionRequest) => void;
    },
  ): void {
    const tracked = this.running.get(agentId);
    if (!tracked || tracked.pid !== handlePid) return;

    for (const request of [...tracked.pendingPermissions.values()]) {
      if (shouldAutoAllowToolPermission(request.toolName, tracked.permissionMode, request.input)) {
        if (tracked.canRespondToPermissions) {
          this.respondToPermission(
            agentId,
            request.requestId,
            { behavior: 'allow', updatedInput: request.input },
            { requirePending: false },
          );
        }
        continue;
      }
      options.onPermissionRequest?.(request);
    }
  }

  private handleControlEvent(
    agentId: string,
    handlePid: number,
    event: Record<string, unknown>,
    options: {
      onPermissionRequest?: (request: ClaudePermissionRequest) => void;
    },
    meta: ClaudeEventMeta,
  ): void {
    const tracked = this.running.get(agentId);
    if (!tracked || tracked.pid !== handlePid) return;

    const parsed = parsePermissionRequest(event);
    if (parsed) {
      const request = this.stashPermissionRequest(tracked, parsed);
      if (meta.replay) {
        // Reconstruct pending state only — do not auto-respond or notify yet.
        return;
      }
      if (shouldAutoAllowToolPermission(parsed.toolName, tracked.permissionMode, parsed.input)) {
        if (tracked.canRespondToPermissions) {
          this.respondToPermission(
            agentId,
            parsed.requestId,
            {
              behavior: 'allow',
              updatedInput: parsed.input,
            },
            { requirePending: false },
          );
        }
        return;
      }
      options.onPermissionRequest?.(request);
      return;
    }

    // Claude continued past a permission prompt (it was answered). Drop it.
    if (meta.replay && event.type !== 'stderr') {
      tracked.pendingPermissions.clear();
    }
  }
}

/** Load ExitPlanMode plan text from disk when the CLI omits inline plan. */
export function enrichPermissionInput(
  toolName: string,
  input: Record<string, unknown>,
  options: { logPath?: string; plansDir?: string } = {},
): Record<string, unknown> {
  if (toolName !== 'ExitPlanMode') return input;
  if (typeof input.plan === 'string' && input.plan.trim()) {
    return input;
  }

  const candidates: string[] = [];
  const inlinePath = extractPlanFilePath(input);
  if (inlinePath) candidates.push(inlinePath);

  if (options.logPath) {
    try {
      candidates.push(...extractPlanFilePathsFromLog(readFileSync(options.logPath, 'utf8')));
    } catch {
      // log may not exist yet
    }
  }

  for (const filePath of listRecentClaudePlanFiles(options.plansDir)) {
    if (!candidates.includes(filePath)) candidates.push(filePath);
  }

  for (const filePath of candidates) {
    try {
      const text = readFileSync(filePath, 'utf8');
      if (text.trim()) {
        return { ...input, plan: text.trim(), planFilePath: filePath };
      }
    } catch {
      // try the next candidate
    }
  }

  return input;
}

export function claudePlansDirectory(): string {
  return path.join(os.homedir(), '.claude', 'plans');
}

function listRecentClaudePlanFiles(plansDir?: string): string[] {
  const dir = plansDir ?? claudePlansDirectory();
  try {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.includes('-agent-'))
      .map((entry) => {
        const filePath = path.join(dir, entry.name);
        return { filePath, mtime: statSync(filePath).mtimeMs };
      })
      .filter((entry) => entry.mtime >= cutoff)
      .sort((a, b) => b.mtime - a.mtime)
      .map((entry) => entry.filePath);
  } catch {
    return [];
  }
}

export function parseGitHubUrl(repoUrl: string): { owner: string; repo: string } {
  const cleaned = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
  const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!match) {
    throw new Error('Invalid GitHub repository URL');
  }
  return { owner: match[1], repo: match[2] };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
