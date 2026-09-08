import type { WorktreeDirEntry, WorktreeFileEntry } from '@agent-orchestrator/shared';
import type { FileTreeNode } from '../../utils/fileTree';

/**
 * Build a tree from the directories loaded so far. Directories whose contents
 * have not been fetched yet come back with no children, and fill in once their
 * listing arrives.
 */
export function buildLazyDirTree(
  dirs: Map<string, WorktreeDirEntry[]>,
  dirPath = '',
): FileTreeNode<WorktreeFileEntry>[] {
  return (dirs.get(dirPath) ?? []).map((entry) =>
    entry.type === 'dir'
      ? {
          type: 'dir',
          name: entry.name,
          path: entry.path,
          children: buildLazyDirTree(dirs, entry.path),
        }
      : { type: 'file', name: entry.name, path: entry.path, file: { path: entry.path } },
  );
}
