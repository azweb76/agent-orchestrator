import { execFileSync } from 'node:child_process';
import { realpathSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import type { ClaudeProcessInfo } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { isPidAlive } from './claude-process.js';

const COMMAND_MAX = 200;

export interface RawProcessRow {
  pid: number;
  ppid: number;
  command: string;
}

export interface OwnedRunMeta {
  sessionId: string;
  agentId: string;
  agentName: string;
  workspaceName: string;
}

export interface ListClaudeProcessesDeps {
  listPs: () => RawProcessRow[];
  resolveCwd: (pid: number) => string | null;
  isAlive: (pid: number) => boolean;
  resolveBinPaths: (claudeBin: string) => Set<string>;
}

function truncateCommand(command: string): string {
  const trimmed = command.trim();
  if (trimmed.length <= COMMAND_MAX) return trimmed;
  return `${trimmed.slice(0, COMMAND_MAX - 1)}…`;
}

/** Parse `ps -ax -o pid=,ppid=,command=` output into rows. */
export function parsePsOutput(stdout: string): RawProcessRow[] {
  const rows: RawProcessRow[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const command = match[3] ?? '';
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(ppid) || ppid < 0) continue;
    rows.push({ pid, ppid, command });
  }
  return rows;
}

/** True for grep/rg noise and the orchestrator stdin-holder sidecar. */
export function isNoiseCommand(command: string): boolean {
  const lower = command.toLowerCase();
  if (/\b(grep|rg|ripgrep)\b/.test(lower) && lower.includes('claude')) return true;
  // Node -e holder that keeps the Claude stdin FIFO open across restarts.
  if (/\bnode\b/.test(lower) && lower.includes('opensync') && lower.includes('fifo')) return true;
  if (/\bnode\b/.test(lower) && /setinterval\(\(\)\s*=>\s*\{\}\s*,\s*1\s*<<\s*30\)/.test(lower)) {
    return true;
  }
  if (/\bnode\b/.test(lower) && lower.includes('holder') && lower.includes('.stdin')) return true;
  return false;
}

function firstArgToken(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    return end > 0 ? trimmed.slice(1, end) : trimmed.slice(1);
  }
  if (trimmed.startsWith("'")) {
    const end = trimmed.indexOf("'", 1);
    return end > 0 ? trimmed.slice(1, end) : trimmed.slice(1);
  }
  return trimmed.split(/\s+/)[0] ?? '';
}

/** Whether this argv looks like a Claude Code CLI process. */
export function isClaudeCliCommand(command: string, claudeBinPaths: Set<string>): boolean {
  if (isNoiseCommand(command)) return false;
  const token = firstArgToken(command);
  if (!token) return false;
  const base = path.basename(token);
  if (base === 'claude' || base.startsWith('claude-')) return true;
  try {
    const resolved = realpathSync(token);
    if (claudeBinPaths.has(resolved)) return true;
  } catch {
    // unresolvable path — fall through
  }
  if (claudeBinPaths.has(token)) return true;
  // Absolute/relative paths that end with /claude without resolving.
  if (/(^|\/)claude(\s|$)/.test(token) || token.endsWith('/claude')) return true;
  return false;
}

export function resolveClaudeBinPaths(claudeBin: string): Set<string> {
  const paths = new Set<string>();
  const trimmed = claudeBin.trim();
  if (!trimmed) return paths;
  paths.add(trimmed);
  try {
    paths.add(realpathSync(trimmed));
  } catch {
    // ignore
  }
  try {
    const linked = readlinkSync(trimmed);
    if (linked) {
      const abs = path.isAbsolute(linked) ? linked : path.resolve(path.dirname(trimmed), linked);
      paths.add(abs);
      try {
        paths.add(realpathSync(abs));
      } catch {
        // ignore
      }
    }
  } catch {
    // not a symlink
  }
  return paths;
}

export function readProcessCwd(pid: number): string | null {
  if (process.platform === 'linux') {
    try {
      return realpathSync(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], {
        encoding: 'utf8',
        timeout: 2_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of out.split('\n')) {
        if (line.startsWith('n')) return line.slice(1) || null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function listPsRows(): RawProcessRow[] {
  const stdout = execFileSync('ps', ['-ax', '-o', 'pid=,ppid=,command='], {
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return parsePsOutput(stdout);
}

function buildOwnedByPid(ctx: AppContext): Map<number, OwnedRunMeta> {
  const owned = new Map<number, OwnedRunMeta>();
  for (const session of ctx.repos.sessions.listRunning()) {
    if (session.pid == null || session.pid <= 0) continue;
    const agent = ctx.repos.agents.getById(session.agentId);
    if (!agent) continue;
    const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
    const workspace = worktree ? ctx.repos.workspaces.getById(worktree.workspaceId) : null;
    owned.set(session.pid, {
      sessionId: session.id,
      agentId: agent.id,
      agentName: agent.name,
      workspaceName: workspace?.name ?? 'Unknown',
    });
  }
  return owned;
}

function toInfo(
  row: RawProcessRow,
  cwd: string | null,
  owned: Map<number, OwnedRunMeta>,
): ClaudeProcessInfo {
  const meta = owned.get(row.pid);
  return {
    pid: row.pid,
    ppid: row.ppid,
    command: truncateCommand(row.command),
    cwd,
    ownership: meta ? 'orchestrator' : 'external',
    agentId: meta?.agentId ?? null,
    agentName: meta?.agentName ?? null,
    sessionId: meta?.sessionId ?? null,
    workspaceName: meta?.workspaceName ?? null,
  };
}

/**
 * Merge live `ps` Claude CLIs with orchestrator running-session PIDs.
 * Owned sessions whose PID is alive are included even if the ps filter missed them.
 */
export function mergeClaudeProcesses(options: {
  psRows: RawProcessRow[];
  claudeBinPaths: Set<string>;
  ownedByPid: Map<number, OwnedRunMeta>;
  resolveCwd: (pid: number) => string | null;
  isAlive: (pid: number) => boolean;
}): ClaudeProcessInfo[] {
  const byPid = new Map<number, ClaudeProcessInfo>();

  for (const row of options.psRows) {
    if (!isClaudeCliCommand(row.command, options.claudeBinPaths)) continue;
    byPid.set(row.pid, toInfo(row, options.resolveCwd(row.pid), options.ownedByPid));
  }

  for (const pid of options.ownedByPid.keys()) {
    if (byPid.has(pid)) continue;
    if (!options.isAlive(pid)) continue;
    byPid.set(
      pid,
      toInfo(
        { pid, ppid: 0, command: 'claude (orchestrator-tracked)' },
        options.resolveCwd(pid),
        options.ownedByPid,
      ),
    );
  }

  return [...byPid.values()].sort((a, b) => {
    const own = (p: ClaudeProcessInfo) => (p.ownership === 'orchestrator' ? 0 : 1);
    return own(a) - own(b) || a.pid - b.pid;
  });
}

const defaultDeps: ListClaudeProcessesDeps = {
  listPs: listPsRows,
  resolveCwd: readProcessCwd,
  isAlive: isPidAlive,
  resolveBinPaths: resolveClaudeBinPaths,
};

/** Inventory of Claude Code processes on this host, with orchestrator ownership. */
export function listClaudeProcesses(
  ctx: AppContext,
  deps: ListClaudeProcessesDeps = defaultDeps,
): ClaudeProcessInfo[] {
  let psRows: RawProcessRow[];
  try {
    psRows = deps.listPs();
  } catch {
    psRows = [];
  }
  const claudeBinPaths = deps.resolveBinPaths(ctx.claude.getBin());
  const ownedByPid = buildOwnedByPid(ctx);
  return mergeClaudeProcesses({
    psRows,
    claudeBinPaths,
    ownedByPid,
    resolveCwd: deps.resolveCwd,
    isAlive: deps.isAlive,
  });
}
