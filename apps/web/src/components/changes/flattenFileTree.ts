import type { DiffFile } from '../../utils/parseUnifiedDiff';
import type { FileTreeNode } from '../../utils/fileTree';

export type FlatFileTreeRow =
  | { type: 'dir'; path: string; name: string; depth: number }
  | { type: 'file'; path: string; name: string; depth: number; file: DiffFile };

/** Flatten an expanded file tree into scrollable rows for virtualization. */
export function flattenVisibleFileTree(
  nodes: FileTreeNode[],
  expanded: Set<string>,
  depth = 0,
): FlatFileTreeRow[] {
  const rows: FlatFileTreeRow[] = [];
  for (const node of nodes) {
    if (node.type === 'dir') {
      rows.push({ type: 'dir', path: node.path, name: node.name, depth });
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
