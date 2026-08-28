import fs from 'node:fs/promises';
import { isPidAlive, sleep } from './claude-process.js';

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
