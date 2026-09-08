import { describe, expect, it } from 'vitest';
import type { DiffFile } from '../../utils/parseUnifiedDiff';
import { buildFileTree } from '../../utils/fileTree';
import {
  collectDiffFiles,
  dirSelectState,
  discardPathsForFile,
  discardPathsForFiles,
  togglePaths,
} from './discardPaths';

function file(path: string, previousPath?: string): DiffFile {
  return {
    path,
    previousPath,
    status: previousPath ? 'renamed' : 'modified',
    patch: '',
    additions: 0,
    deletions: 0,
  };
}

describe('discardPathsForFile', () => {
  it('includes the rename source path', () => {
    expect(discardPathsForFile(file('src/new.ts', 'src/old.ts'))).toEqual(['src/new.ts', 'src/old.ts']);
  });

  it('returns a single path for ordinary files', () => {
    expect(discardPathsForFile(file('src/a.ts'))).toEqual(['src/a.ts']);
  });
});

describe('discardPathsForFiles', () => {
  it('dedupes overlapping rename and edit paths', () => {
    expect(
      discardPathsForFiles([file('src/new.ts', 'src/old.ts'), file('src/old.ts')]),
    ).toEqual(['src/new.ts', 'src/old.ts']);
  });
});

describe('collectDiffFiles / dirSelectState / togglePaths', () => {
  it('collects nested files and toggles a directory selection', () => {
    const files = [file('src/a.ts'), file('src/util/b.ts'), file('README.md')];
    const tree = buildFileTree(files);
    const src = tree.find((node) => node.type === 'dir' && node.name === 'src');
    if (!src || src.type !== 'dir') throw new Error('expected src');
    const srcFiles = collectDiffFiles([src]);
    expect(srcFiles.map((item) => item.path)).toEqual(['src/util/b.ts', 'src/a.ts']);

    const selected = togglePaths(new Set(), srcFiles.map((item) => item.path), true);
    expect(dirSelectState(['src/a.ts', 'src/util/b.ts'], selected)).toBe('all');
    expect(dirSelectState(['src/a.ts', 'README.md'], selected)).toBe('some');
    expect(dirSelectState(['README.md'], selected)).toBe('none');
  });
});
