import path from 'node:path';
import { slugify } from './repo-slug.js';

/**
 * Worktree directory names arrive in request bodies and are joined into a
 * filesystem path, so the caller-supplied value gets the same slugify treatment
 * the branch fallback always had. Slugify can also yield an empty string (e.g.
 * '...'), which would otherwise resolve to the workspace root itself.
 */
export function resolveWorktreeName(requested: string | undefined, fallback: string): string {
  const name = slugify(requested ?? '') || slugify(fallback);
  if (!name) throw new Error('Could not derive a worktree name');
  return name;
}

/**
 * Resolve a worktree path and assert it stays under the workspace's worktree
 * root. Defence in depth behind `resolveWorktreeName`: this path is persisted on
 * the worktree row and later passed to a recursive delete.
 */
export function worktreePathFor(dataDir: string, workspaceId: string, name: string): string {
  const root = path.resolve(dataDir, 'worktrees', workspaceId);
  const resolved = path.resolve(root, name);
  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    throw new Error('Invalid worktree name');
  }
  return resolved;
}
