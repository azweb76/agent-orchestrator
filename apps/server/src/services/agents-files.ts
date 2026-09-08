import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorktreeFileContent } from '@agent-orchestrator/shared';
import {
  CHAT_MENTION_MAX_FILE_BYTES,
  isSensitiveMentionPath,
  resolveWorktreeFilePath,
} from './chat-mentions.js';
import { getAgentDetail } from './agents-lifecycle.js';
import type { AppContext } from './app-context.js';

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

/** Read one file inside a worktree, capped and guarded against path escape. */
export async function readWorktreeFile(
  worktreeRoot: string,
  relPath: string,
): Promise<WorktreeFileContent> {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
  if (normalized.split('/').includes('.git')) {
    throw new WorktreeFileError(403, 'Cannot read files inside .git');
  }
  if (isSensitiveMentionPath(normalized)) {
    throw new WorktreeFileError(403, 'File hidden for safety');
  }

  const absPath = resolveWorktreeFilePath(worktreeRoot, normalized);
  if (!absPath) throw new WorktreeFileError(400, 'Invalid file path');

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

export async function readAgentWorktreeFile(
  ctx: AppContext,
  agentId: string,
  relPath: string,
): Promise<WorktreeFileContent> {
  const detail = await getAgentDetail(ctx, agentId);
  return readWorktreeFile(detail.worktree.path, relPath);
}
