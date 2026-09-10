import fs from 'node:fs/promises';
import path from 'node:path';

/** True when `target` is `root` itself or lives under it, lexically. */
export function isContained(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);
}

/**
 * Real path of `target`, or of its deepest existing ancestor with the missing
 * tail appended. Lets a not-yet-created file be checked before it is written.
 */
async function realPathOrNearest(target: string): Promise<string | null> {
  let current = path.resolve(target);
  const tail: string[] = [];
  for (;;) {
    const real = await fs.realpath(current).catch(() => null);
    if (real) return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
    const parent = path.dirname(current);
    if (parent === current) return null;
    tail.push(path.basename(current));
    current = parent;
  }
}

/**
 * Containment check that survives symlinks.
 *
 * A lexical `..`/absolute-path rejection is defeated by a symlink *inside* the
 * tree that points outside it — committed by a cloned repo, or created by the
 * agent itself. Since `stat`/`readFile`/`open` all follow symlinks, the guard
 * has to compare real paths, not requested ones.
 */
export async function isRealPathContained(root: string, target: string): Promise<boolean> {
  const realRoot = await fs.realpath(path.resolve(root)).catch(() => null);
  if (!realRoot) return false;
  const realTarget = await realPathOrNearest(target);
  if (!realTarget) return false;
  return isContained(realRoot, realTarget);
}

/** True when the final path component is itself a symlink. */
export async function isSymlink(target: string): Promise<boolean> {
  const stat = await fs.lstat(target).catch(() => null);
  return stat?.isSymbolicLink() ?? false;
}
