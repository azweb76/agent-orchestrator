import { describe, expect, it } from 'vitest';
import { buildFileTree, defaultExpandedDirs } from './fileTree';
import type { DiffFile } from './parseUnifiedDiff';

function diffFile(path: string): DiffFile {
  return { path, status: 'modified', patch: '', additions: 0, deletions: 0 };
}

describe('buildFileTree', () => {
  it('nests files under their directories', () => {
    const tree = buildFileTree([diffFile('src/utils/a.ts'), diffFile('src/b.ts'), diffFile('README.md')]);

    expect(tree.map((node) => `${node.type}:${node.name}`)).toEqual(['dir:src', 'file:README.md']);

    const src = tree[0];
    if (src?.type !== 'dir') throw new Error('expected src dir');
    expect(src.path).toBe('src');
    expect(src.children.map((node) => `${node.type}:${node.name}`)).toEqual(['dir:utils', 'file:b.ts']);
  });

  it('sorts directories before files, each alphabetically', () => {
    const tree = buildFileTree([diffFile('z.txt'), diffFile('a.txt'), diffFile('lib/x.ts'), diffFile('app/y.ts')]);
    expect(tree.map((node) => node.name)).toEqual(['app', 'lib', 'a.txt', 'z.txt']);
  });

  it('reuses one directory node for files sharing a parent', () => {
    const tree = buildFileTree([diffFile('src/a.ts'), diffFile('src/b.ts')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.type).toBe('dir');
  });
});

describe('defaultExpandedDirs', () => {
  it('expands directories up to the depth limit', () => {
    const tree = buildFileTree([diffFile('a/b/c/d.ts'), diffFile('x/y.ts')]);
    expect(defaultExpandedDirs(tree)).toEqual(['a', 'a/b', 'x']);
    expect(defaultExpandedDirs(tree, 1)).toEqual(['a', 'x']);
  });

  it('returns nothing for a flat file list', () => {
    const tree = buildFileTree([diffFile('a.ts'), diffFile('b.ts')]);
    expect(defaultExpandedDirs(tree)).toEqual([]);
  });
});
