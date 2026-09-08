import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_DISCARD_PATHS = 200;
const GIT_PATH_CHUNK = 64;

/** Normalize a worktree-relative path. Rejects traversal, absolute, and .git paths. */
export function normalizeWorktreeRelPath(input: string): string {
  const trimmed = input.trim().replaceAll('\\', '/');
  if (!trimmed) throw new Error('File path is required');
  const withoutDot = trimmed.replace(/^\.\//, '');
  if (!withoutDot || withoutDot === '.') throw new Error(`Invalid file path: ${input}`);
  if (withoutDot.startsWith('/') || withoutDot.includes('\0')) {
    throw new Error(`Invalid file path: ${input}`);
  }
  const parts = withoutDot.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`Invalid file path: ${input}`);
  }
  if (parts[0] === '.git') throw new Error(`Cannot undo .git paths: ${input}`);
  return parts.join('/');
}

export function normalizeDiscardPaths(paths: string[]): string[] {
  if (paths.length === 0) throw new Error('Select at least one file to undo');
  if (paths.length > MAX_DISCARD_PATHS) {
    throw new Error(`Cannot undo more than ${MAX_DISCARD_PATHS} files at once`);
  }
  return [...new Set(paths.map(normalizeWorktreeRelPath))];
}

async function gitChunked(
  worktreePath: string,
  prefix: string[],
  files: string[],
): Promise<void> {
  for (let i = 0; i < files.length; i += GIT_PATH_CHUNK) {
    const chunk = files.slice(i, i + GIT_PATH_CHUNK);
    await execFileAsync('git', ['-C', worktreePath, ...prefix, '--', ...chunk], {
      maxBuffer: 10 * 1024 * 1024,
    });
  }
}

async function listHeadPaths(worktreePath: string, files: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < files.length; i += GIT_PATH_CHUNK) {
    const chunk = files.slice(i, i + GIT_PATH_CHUNK);
    const { stdout } = await execFileAsync(
      'git',
      ['-C', worktreePath, 'ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', ...chunk],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    for (const name of stdout.split('\0')) {
      if (name) found.add(name);
    }
  }
  return found;
}

async function removeEmptyParents(worktreePath: string, filePath: string): Promise<void> {
  const root = path.resolve(worktreePath);
  let dir = path.dirname(path.join(root, filePath));
  while (dir.startsWith(root) && dir !== root) {
    try {
      await fs.rmdir(dir);
    } catch {
      break;
    }
    dir = path.dirname(dir);
  }
}

/**
 * Restore listed worktree paths to HEAD. Tracked files are restored; paths not
 * in HEAD (untracked / staged-new) are unstaged and deleted.
 */
export async function restoreWorktreePaths(
  worktreePath: string,
  paths: string[],
): Promise<string[]> {
  const unique = normalizeDiscardPaths(paths);
  const inHead = await listHeadPaths(worktreePath, unique);
  const restore = unique.filter((filePath) => inHead.has(filePath));
  const remove = unique.filter((filePath) => !inHead.has(filePath));

  if (restore.length > 0) {
    await gitChunked(worktreePath, ['restore', '--source=HEAD', '--staged', '--worktree'], restore);
  }

  if (remove.length > 0) {
    await gitChunked(worktreePath, ['rm', '-f', '--ignore-unmatch', '--cached'], remove);
    for (const filePath of remove) {
      await fs.rm(path.join(worktreePath, filePath), { force: true });
      await removeEmptyParents(worktreePath, filePath);
    }
  }

  return unique;
}
