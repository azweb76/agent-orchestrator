import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  buildControlResponse,
  isInteractivePermissionTool,
  parsePermissionRequest,
  type PermissionDecision,
} from './permission-protocol.js';

const execFileAsync = promisify(execFile);

export const DEFAULT_ALLOWED_TOOLS =
  'Read,Edit,Bash,Glob,Grep,Write,AskUserQuestion,ExitPlanMode';

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

  async fetchPullRequest(mainRepoPath: string, prNumber: number, localBranch: string): Promise<void> {
    await execFileAsync(
      'git',
      ['-C', mainRepoPath, 'fetch', 'origin', `pull/${prNumber}/head:${localBranch}`],
      { maxBuffer: 10 * 1024 * 1024 },
    );
  }

  async removeWorktree(mainRepoPath: string, worktreePath: string): Promise<void> {
    try {
      await execFileAsync('git', ['-C', mainRepoPath, 'worktree', 'remove', '--force', worktreePath]);
    } catch {
      await fs.rm(worktreePath, { recursive: true, force: true });
    }
  }

  async getDiff(worktreePath: string, baseRef?: string): Promise<{ stat: string; patch: string }> {
    const base = baseRef ?? 'HEAD';
    const [statResult, patchResult] = await Promise.all([
      execFileAsync('git', ['-C', worktreePath, 'diff', '--stat', base], { maxBuffer: 10 * 1024 * 1024 }),
      execFileAsync('git', ['-C', worktreePath, 'diff', base], { maxBuffer: 20 * 1024 * 1024 }),
    ]);
    return { stat: statResult.stdout.trim(), patch: patchResult.stdout };
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

export interface ClaudeRunOptions {
  cwd: string;
  prompt: string;
  model?: string;
  environment?: string | null;
  sessionId?: string | null;
  allowedTools?: string;
  permissionMode?: ClaudePermissionMode;
  /** Absolute image paths to reference in the prompt for Claude's Read tool. */
  imagePaths?: string[];
  onEvent?: (event: ClaudeStreamEvent) => void;
  /** Interactive tool permission / AskUserQuestion / ExitPlanMode requests. */
  onPermissionRequest?: (request: ClaudePermissionRequest) => void;
  /** Called once the detached process has been spawned (pid + log path). */
  onStarted?: (handle: ClaudeRunHandle) => void;
  /**
   * When aborted, the Claude process is killed. Do not wire this to HTTP disconnect /
   * server shutdown — only to explicit stop requests.
   */
  signal?: AbortSignal;
}

export function buildClaudeArgs(options: {
  prompt: string;
  model?: string;
  environment?: string | null;
  sessionId?: string | null;
  allowedTools?: string;
  permissionMode?: ClaudePermissionMode;
  imagePaths?: string[];
  defaultAllowedTools?: string;
}): string[] {
  const prompt = buildPromptWithImages(options.prompt, options.imagePaths ?? []);
  const permissionMode = options.permissionMode ?? 'plan';
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    '--allowedTools',
    options.allowedTools ?? options.defaultAllowedTools ?? DEFAULT_ALLOWED_TOOLS,
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

  if (options.environment) {
    args.push('--environment', options.environment);
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
  /** Kept open for control_response writes; null when re-attached after restart. */
  stdin: NodeJS.WritableStream | null;
  pendingPermissions: Map<string, ClaudePermissionRequest>;
  /** True when stdin is available for interactive permission replies. */
  canRespondToPermissions: boolean;
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kill a detached Claude process group (falls back to the single pid). */
export function killProcessTree(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process already exited
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Follow a Claude stream-json log until the process exits.
 */
export async function followClaudeLog(
  pid: number,
  logPath: string,
  onLine: (line: string) => void,
  options: { pollMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const pollMs = options.pollMs ?? 50;
  let position = 0;
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
    private defaultAllowedTools = DEFAULT_ALLOWED_TOOLS,
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
  stop(agentId: string, pidFallback?: number | null): boolean {
    const tracked = this.running.get(agentId);
    const pid = tracked?.pid ?? pidFallback ?? null;
    if (pid == null) return false;
    try {
      tracked?.stdin?.end();
    } catch {
      // ignore
    }
    killProcessTree(pid);
    this.running.delete(agentId);
    return true;
  }

  /** Drop in-memory handles without killing processes (used on app shutdown). */
  releaseAll(): void {
    for (const tracked of this.running.values()) {
      try {
        // Keep the OS process alive, but drop our stdin handle (EOF).
        tracked.stdin = null;
        tracked.canRespondToPermissions = false;
      } catch {
        // ignore
      }
    }
    this.running.clear();
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
      tracked.stdin.write(payload);
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
      throw new Error('Agent already has a running Claude process');
    }

    const args = buildClaudeArgs({
      prompt: options.prompt,
      model: options.model,
      environment: options.environment,
      sessionId: options.sessionId,
      allowedTools: options.allowedTools,
      permissionMode: options.permissionMode,
      imagePaths: options.imagePaths,
      defaultAllowedTools: this.defaultAllowedTools,
    });

    const logPath = path.join(this.runsDir, `${agentId}-${Date.now()}.log`);
    const outFd = openSync(logPath, 'w');

    let proc: ChildProcess;
    try {
      proc = spawn(this.claudeBin, args, {
        cwd: options.cwd,
        env: process.env,
        detached: true,
        stdio: ['pipe', outFd, outFd],
      });
    } finally {
      closeSync(outFd);
    }

    if (proc.pid == null) {
      throw new Error('Failed to start Claude process');
    }

    // Allow the Node event loop to exit without waiting on this handle; the OS process keeps running.
    proc.unref();

    const handle: ClaudeRunHandle = { pid: proc.pid, logPath };
    this.running.set(agentId, {
      ...handle,
      proc,
      stdin: proc.stdin,
      pendingPermissions: new Map(),
      canRespondToPermissions: Boolean(proc.stdin),
    });
    options.onStarted?.(handle);

    return this.monitorRun(agentId, handle, options.sessionId ?? null, options, options.signal);
  }

  /**
   * Re-attach to a Claude process that outlived a previous orchestrator instance.
   * Stdin is not recoverable, so interactive permission prompts cannot be answered —
   * those runs are stopped when a control_request is observed.
   */
  async attachToRun(
    agentId: string,
    handle: ClaudeRunHandle,
    options: {
      sessionId?: string | null;
      onEvent?: (event: ClaudeStreamEvent) => void;
      onPermissionRequest?: (request: ClaudePermissionRequest) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<ClaudeRunResult> {
    this.running.set(agentId, {
      pid: handle.pid,
      logPath: handle.logPath,
      stdin: null,
      pendingPermissions: new Map(),
      canRespondToPermissions: false,
    });
    return this.monitorRun(agentId, handle, options.sessionId ?? null, options, options.signal);
  }

  private async monitorRun(
    agentId: string,
    handle: ClaudeRunHandle,
    initialSessionId: string | null,
    options: {
      onEvent?: (event: ClaudeStreamEvent) => void;
      onPermissionRequest?: (request: ClaudePermissionRequest) => void;
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

    try {
      await followClaudeLog(handle.pid, handle.logPath, (line) => {
        try {
          const event = JSON.parse(line) as ClaudeStreamEvent;
          events.push(event);
          options.onEvent?.(event);

          if (event.session_id) {
            sessionId = event.session_id;
          }

          if (event.type === 'result' && typeof event.result === 'string') {
            result = event.result;
          }

          this.handleControlEvent(agentId, event as Record<string, unknown>, options);
        } catch {
          // ignore malformed lines
        }
      });
    } finally {
      signal?.removeEventListener('abort', handleAbort);
      const tracked = this.running.get(agentId);
      try {
        tracked?.stdin?.end();
      } catch {
        // ignore
      }
      this.running.delete(agentId);
    }

    if (stopped && !result) {
      return { result: '[stopped]', sessionId, events, stopped: true };
    }

    return { result, sessionId, events, stopped };
  }

  private handleControlEvent(
    agentId: string,
    event: Record<string, unknown>,
    options: {
      onPermissionRequest?: (request: ClaudePermissionRequest) => void;
    },
  ): void {
    const parsed = parsePermissionRequest(event);
    if (!parsed) return;

    const tracked = this.running.get(agentId);
    if (!tracked) return;

    if (!tracked.canRespondToPermissions) {
      // Re-attached run: cannot answer interactive prompts — stop so the agent does not hang.
      killProcessTree(tracked.pid);
      return;
    }

    if (!isInteractivePermissionTool(parsed.toolName)) {
      this.respondToPermission(
        agentId,
        parsed.requestId,
        {
          behavior: 'allow',
          updatedInput: parsed.input,
        },
        { requirePending: false },
      );
      return;
    }

    const request: ClaudePermissionRequest = {
      requestId: parsed.requestId,
      toolName: parsed.toolName,
      input: parsed.input,
      toolUseId: parsed.toolUseId,
    };
    tracked.pendingPermissions.set(parsed.requestId, request);
    options.onPermissionRequest?.(request);
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
