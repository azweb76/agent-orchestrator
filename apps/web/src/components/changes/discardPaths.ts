import type { DiffFile } from '../../utils/parseUnifiedDiff';
import type { FileTreeNode } from '../../utils/fileTree';

/** Paths to restore for a diff file, including a rename's previous path. */
export function discardPathsForFile(file: DiffFile): string[] {
  if (file.previousPath && file.previousPath !== file.path) {
    return [file.path, file.previousPath];
  }
  return [file.path];
}

export function discardPathsForFiles(files: DiffFile[]): string[] {
  const paths = new Set<string>();
  for (const file of files) {
    for (const filePath of discardPathsForFile(file)) paths.add(filePath);
  }
  return [...paths];
}

export function collectDiffFiles(nodes: FileTreeNode[]): DiffFile[] {
  const files: DiffFile[] = [];
  const walk = (list: FileTreeNode[]) => {
    for (const node of list) {
      if (node.type === 'file') files.push(node.file);
      else walk(node.children);
    }
  };
  walk(nodes);
  return files;
}

export function dirSelectState(
  filePaths: string[],
  selected: Set<string>,
): 'none' | 'some' | 'all' {
  if (filePaths.length === 0) return 'none';
  const selectedCount = filePaths.filter((filePath) => selected.has(filePath)).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === filePaths.length) return 'all';
  return 'some';
}

export function togglePaths(prev: Set<string>, paths: string[], nextSelected: boolean): Set<string> {
  const next = new Set(prev);
  for (const filePath of paths) {
    if (nextSelected) next.add(filePath);
    else next.delete(filePath);
  }
  return next;
}
