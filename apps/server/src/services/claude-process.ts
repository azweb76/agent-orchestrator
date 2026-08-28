import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

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
export function scheduleForceKill(pid: number, waitMs = 1000): void {
  const timer = setTimeout(() => {
    if (!isPidAlive(pid)) return;
    signalProcessTree(pid, 'SIGKILL');
  }, waitMs);
  timer.unref();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitForSpawn(proc: ChildProcess): Promise<void> {
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

export function createStdinFifo(fifoPath: string): void {
  try {
    unlinkSync(fifoPath);
  } catch {
    // ignore
  }
  execFileSync('mkfifo', [fifoPath], { stdio: 'ignore' });
}

export function spawnStdinHolder(fifoPath: string, holderPidPath: string): number {
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

export function readHolderPid(logPath: string): number | null {
  try {
    const raw = readFileSync(stdinPathsForLog(logPath).holderPidPath, 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function killStdinHolder(holderPid: number | null | undefined): void {
  if (holderPid == null) return;
  try {
    process.kill(holderPid, 'SIGTERM');
  } catch {
    // already gone
  }
  scheduleForceKill(holderPid);
}

export function cleanupStdinSidecars(logPath: string | null | undefined): void {
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

export function openFifoWriteStream(fifoPath: string): NodeJS.WritableStream {
  const fd = openSync(fifoPath, 'w');
  const stream = createWriteStream(fifoPath, { fd, autoClose: true });
  stream.on('error', () => {
    // EPIPE if Claude already exited
  });
  return stream;
}

export function reopenStdinFromLog(logPath: string): {
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
