import type { DiffFile } from './parseUnifiedDiff';

interface FileTreeFileNode<T> {
  type: 'file';
  name: string;
  path: string;
  file: T;
}

export interface FileTreeDirNode<T = DiffFile> {
  type: 'dir';
  name: string;
  path: string;
  children: FileTreeNode<T>[];
}

export type FileTreeNode<T = DiffFile> = FileTreeFileNode<T> | FileTreeDirNode<T>;

/** Build a nested directory tree from flat file paths. */
export function buildFileTree<T extends { path: string }>(files: T[]): FileTreeNode<T>[] {
  const root: FileTreeDirNode<T> = { type: 'dir', name: '', path: '', children: [] };

  const ensureDir = (parent: FileTreeDirNode<T>, name: string, path: string): FileTreeDirNode<T> => {
    const existing = parent.children.find(
      (child): child is FileTreeDirNode<T> => child.type === 'dir' && child.name === name,
    );
    if (existing) return existing;
    const dir: FileTreeDirNode<T> = { type: 'dir', name, path, children: [] };
    parent.children.push(dir);
    return dir;
  };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let current = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i]!;
      const dirPath = parts.slice(0, i + 1).join('/');
      current = ensureDir(current, name, dirPath);
    }
    const name = parts[parts.length - 1]!;
    current.children.push({ type: 'file', name, path: file.path, file });
  }

  const sortNodes = (nodes: FileTreeNode<T>[]): FileTreeNode<T>[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.type === 'dir') sortNodes(node.children);
    }
    return nodes;
  };

  return sortNodes(root.children);
}

/** Collect every directory path that should start expanded. */
export function defaultExpandedDirs<T>(nodes: FileTreeNode<T>[], maxDepth = 2): string[] {
  const expanded: string[] = [];
  const walk = (list: FileTreeNode<T>[], depth: number) => {
    for (const node of list) {
      if (node.type !== 'dir') continue;
      if (depth < maxDepth) expanded.push(node.path);
      walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return expanded;
}

/** Collect every directory path in the tree (for expand-all). */
export function allDirPaths<T>(nodes: FileTreeNode<T>[]): string[] {
  const paths: string[] = [];
  const walk = (list: FileTreeNode<T>[]) => {
    for (const node of list) {
      if (node.type !== 'dir') continue;
      paths.push(node.path);
      walk(node.children);
    }
  };
  walk(nodes);
  return paths;
}

/** Case-insensitive path filter for the Changes file tree. */
export function filterDiffFiles(files: DiffFile[], query: string): DiffFile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return files;
  return files.filter(
    (file) =>
      file.path.toLowerCase().includes(needle) ||
      (file.previousPath?.toLowerCase().includes(needle) ?? false),
  );
}
