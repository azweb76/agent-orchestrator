import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

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

export interface ClaudeRunOptions {
  cwd: string;
  prompt: string;
  model?: string;
  environment?: string | null;
  sessionId?: string | null;
  allowedTools?: string;
  onEvent?: (event: ClaudeStreamEvent) => void;
  signal?: AbortSignal;
}

export class ClaudeService {
  private running = new Map<string, ChildProcess>();

  constructor(
    private claudeBin: string,
    private defaultAllowedTools = 'Read,Edit,Bash,Glob,Grep,Write',
  ) {}

  isAvailable(): boolean {
    return Boolean(this.claudeBin);
  }

  getRunningProcess(agentId: string): ChildProcess | undefined {
    return this.running.get(agentId);
  }

  async checkInstalled(): Promise<boolean> {
    try {
      await execFileAsync(this.claudeBin, ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  stop(agentId: string): boolean {
    const proc = this.running.get(agentId);
    if (!proc) return false;
    proc.kill('SIGTERM');
    this.running.delete(agentId);
    return true;
  }

  async runStreaming(agentId: string, options: ClaudeRunOptions): Promise<{
    result: string;
    sessionId: string | null;
    events: ClaudeStreamEvent[];
  }> {
    const args = [
      '-p',
      options.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--allowedTools',
      options.allowedTools ?? this.defaultAllowedTools,
      '--dangerously-skip-permissions',
    ];

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.environment) {
      args.push('--environment', options.environment);
    }

    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    const events: ClaudeStreamEvent[] = [];
    let result = '';
    let sessionId: string | null = options.sessionId ?? null;

    return new Promise((resolve, reject) => {
      const proc = spawn(this.claudeBin, args, {
        cwd: options.cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.running.set(agentId, proc);

      let buffer = '';

      const handleAbort = () => {
        proc.kill('SIGTERM');
      };
      options.signal?.addEventListener('abort', handleAbort);

      proc.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
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
          } catch {
            // ignore malformed lines
          }
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          options.onEvent?.({ type: 'stderr', result: text });
        }
      });

      proc.on('error', (err) => {
        this.running.delete(agentId);
        options.signal?.removeEventListener('abort', handleAbort);
        reject(err);
      });

      proc.on('close', (code) => {
        this.running.delete(agentId);
        options.signal?.removeEventListener('abort', handleAbort);

        if (code === 0 || result) {
          resolve({ result, sessionId, events });
        } else if (options.signal?.aborted) {
          resolve({ result: result || '[stopped]', sessionId, events });
        } else {
          reject(new Error(`Claude exited with code ${code ?? 'unknown'}`));
        }
      });
    });
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
