import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { WorktreeDirEntry, WorktreeFileContent } from '@agent-orchestrator/shared';
import {
  CHAT_MENTION_MAX_FILE_BYTES,
  isSensitiveMentionPath,
  resolveWorktreeFilePath,
} from './chat-mentions.js';
import { getAgentDetail } from './agents-lifecycle.js';
import type { AppContext } from './app-context.js';

const execFileAsync = promisify(execFile);

/** Same cap the @-mention reader uses, so both paths refuse the same files. */
export const WORKTREE_FILE_MAX_BYTES = CHAT_MENTION_MAX_FILE_BYTES;

/** Carries the HTTP status so the route can answer 400/403/404 instead of 500. */
export class WorktreeFileError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'WorktreeFileError';
  }
}

/** Drop a trailing byte sequence that a byte-boundary cut left incomplete. */
function trimPartialUtf8(buffer: Buffer): Buffer {
  let index = buffer.length - 1;
  let continuations = 0;
  while (index >= 0 && (buffer[index]! & 0xc0) === 0x80 && continuations < 3) {
    continuations += 1;
    index -= 1;
  }
  if (index < 0) return buffer;
  const lead = buffer[index]!;
  const expected = lead >= 0xf0 ? 3 : lead >= 0xe0 ? 2 : lead >= 0xc0 ? 1 : 0;
  return expected > continuations ? buffer.subarray(0, index) : buffer;
}

/** Apply the shared .git / sensitive / escape guards to a requested path. */
function guardWorktreePath(worktreeRoot: string, relPath: string): { rel: string; abs: string } {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
  if (normalized.split('/').includes('.git')) {
    throw new WorktreeFileError(403, 'Cannot read files inside .git');
  }
  if (isSensitiveMentionPath(normalized)) {
    throw new WorktreeFileError(403, 'File hidden for safety');
  }
  const abs = resolveWorktreeFilePath(worktreeRoot, normalized);
  if (!abs) throw new WorktreeFileError(400, 'Invalid file path');
  return { rel: normalized, abs };
}

/** Read one file inside a worktree, capped and guarded against path escape. */
export async function readWorktreeFile(
  worktreeRoot: string,
  relPath: string,
): Promise<WorktreeFileContent> {
  const { rel: normalized, abs: absPath } = guardWorktreePath(worktreeRoot, relPath);

  const stat = await fs.stat(absPath).catch(() => null);
  if (!stat) throw new WorktreeFileError(404, 'File not found');
  if (!stat.isFile()) throw new WorktreeFileError(404, 'Not a file');

  const head = Buffer.alloc(Math.min(stat.size, WORKTREE_FILE_MAX_BYTES));
  const handle = await fs.open(absPath, 'r');
  let bytesRead: number;
  try {
    bytesRead = (await handle.read(head, 0, head.length, 0)).bytesRead;
  } finally {
    await handle.close();
  }

  const filePath = path.posix.normalize(normalized);
  const body = head.subarray(0, bytesRead);
  if (body.includes(0)) {
    return { path: filePath, content: '', size: stat.size, truncated: false, binary: true };
  }

  const truncated = stat.size > WORKTREE_FILE_MAX_BYTES;
  const text = (truncated ? trimPartialUtf8(body) : body).toString('utf8');
  return { path: filePath, content: text, size: stat.size, truncated, binary: false };
}

/** Ask git which of these worktree-relative paths .gitignore excludes. */
async function ignoredPaths(worktreeRoot: string, relPaths: string[]): Promise<Set<string>> {
  const ignored = new Set<string>();
  // Paths go as argv, so chunk them to stay well inside the OS argument limit.
  for (let start = 0; start < relPaths.length; start += 200) {
    const chunk = relPaths.slice(start, start + 200);
    const args = ['-C', worktreeRoot, 'check-ignore', '--', ...chunk];
    // check-ignore exits 1 when nothing in the chunk is ignored.
    const stdout = await execFileAsync('git', args).then(
      (result) => result.stdout,
      (err: { stdout?: string }) => err.stdout ?? '',
    );
    // Match reported lines back to the chunk, so a newline in a name cannot
    // turn into a bogus path that hides a sibling.
    const chunkPaths = new Set(chunk);
    for (const entry of stdout.split('\n')) {
      if (chunkPaths.has(entry)) ignored.add(entry);
    }
  }
  return ignored;
}

/** List one directory's immediate children, so the web tree can expand lazily. */
export async function listWorktreeDir(
  worktreeRoot: string,
  relPath: string,
): Promise<WorktreeDirEntry[]> {
  const requested = relPath.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
  const isRoot = requested === '' || requested === '.';
  const { rel, abs } = isRoot
    ? { rel: '', abs: path.resolve(worktreeRoot) }
    : guardWorktreePath(worktreeRoot, requested);

  const dirents = await fs.readdir(abs, { withFileTypes: true }).catch(() => null);
  if (!dirents) throw new WorktreeFileError(404, 'Directory not found');

  const candidates = dirents
    .filter((dirent) => dirent.isFile() || dirent.isDirectory())
    .filter((dirent) => dirent.name !== '.git' && !isSensitiveMentionPath(dirent.name))
    .map((dirent) => ({
      name: dirent.name,
      path: rel ? `${rel}/${dirent.name}` : dirent.name,
      type: dirent.isDirectory() ? ('dir' as const) : ('file' as const),
    }));

  const ignored = await ignoredPaths(worktreeRoot, candidates.map((entry) => entry.path));
  return candidates
    .filter((entry) => !ignored.has(entry.path))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

export async function listAgentWorktreeDir(
  ctx: AppContext,
  agentId: string,
  relPath: string,
): Promise<WorktreeDirEntry[]> {
  const detail = await getAgentDetail(ctx, agentId);
  return listWorktreeDir(detail.worktree.path, relPath);
}

export async function readAgentWorktreeFile(
  ctx: AppContext,
  agentId: string,
  relPath: string,
): Promise<WorktreeFileContent> {
  const detail = await getAgentDetail(ctx, agentId);
  return readWorktreeFile(detail.worktree.path, relPath);
}
