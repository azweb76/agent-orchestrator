import type { DiffFile } from './parseUnifiedDiff';

interface FileTreeFileNode {
  type: 'file';
  name: string;
  path: string;
  file: DiffFile;
}

export interface FileTreeDirNode {
  type: 'dir';
  name: string;
  path: string;
  children: FileTreeNode[];
}

export type FileTreeNode = FileTreeFileNode | FileTreeDirNode;

/** Build a nested directory tree from flat diff file paths. */
export function buildFileTree(files: DiffFile[]): FileTreeNode[] {
  const root: FileTreeDirNode = { type: 'dir', name: '', path: '', children: [] };

  const ensureDir = (parent: FileTreeDirNode, name: string, path: string): FileTreeDirNode => {
    const existing = parent.children.find(
      (child): child is FileTreeDirNode => child.type === 'dir' && child.name === name,
    );
    if (existing) return existing;
    const dir: FileTreeDirNode = { type: 'dir', name, path, children: [] };
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

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
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
export function defaultExpandedDirs(nodes: FileTreeNode[], maxDepth = 2): string[] {
  const expanded: string[] = [];
  const walk = (list: FileTreeNode[], depth: number) => {
    for (const node of list) {
      if (node.type !== 'dir') continue;
      if (depth < maxDepth) expanded.push(node.path);
      walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return expanded;
}
