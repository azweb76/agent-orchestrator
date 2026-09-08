import type { DiffFile } from '../../utils/parseUnifiedDiff';
import type { FileTreeNode } from '../../utils/fileTree';

export type FlatFileTreeRow<T = DiffFile> =
  | { type: 'dir'; path: string; name: string; depth: number; filePaths: string[] }
  | { type: 'file'; path: string; name: string; depth: number; file: T };

function descendantFilePaths<T>(node: FileTreeNode<T>): string[] {
  if (node.type === 'file') return [node.path];
  return node.children.flatMap(descendantFilePaths);
}

/** Flatten an expanded file tree into scrollable rows for virtualization. */
export function flattenVisibleFileTree<T>(
  nodes: FileTreeNode<T>[],
  expanded: Set<string>,
  depth = 0,
): FlatFileTreeRow<T>[] {
  const rows: FlatFileTreeRow<T>[] = [];
  for (const node of nodes) {
    if (node.type === 'dir') {
      rows.push({
        type: 'dir',
        path: node.path,
        name: node.name,
        depth,
        filePaths: descendantFilePaths(node),
      });
      if (expanded.has(node.path)) {
        rows.push(...flattenVisibleFileTree(node.children, expanded, depth + 1));
      }
    } else {
      rows.push({
        type: 'file',
        path: node.path,
        name: node.name,
        depth,
        file: node.file,
      });
    }
  }
  return rows;
}

/** Use Virtuoso when the visible tree has more than this many rows. */
export const FILE_TREE_VIRTUOSO_THRESHOLD = 48;
