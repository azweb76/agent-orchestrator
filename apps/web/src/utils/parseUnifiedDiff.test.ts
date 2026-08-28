import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './parseUnifiedDiff';

const modifiedDiff = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,3 +1,3 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
].join('\n');

const addedDiff = [
  'diff --git a/docs/new.md b/docs/new.md',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/docs/new.md',
  '@@ -0,0 +1,2 @@',
  '+# Title',
  '+Body',
].join('\n');

const deletedDiff = [
  'diff --git a/old.txt b/old.txt',
  'deleted file mode 100644',
  'index 4444444..0000000',
  '--- a/old.txt',
  '+++ /dev/null',
  '@@ -1,1 +0,0 @@',
  '-goodbye',
].join('\n');

const renamedDiff = [
  'diff --git a/src/before.ts b/src/after.ts',
  'similarity index 95%',
  'rename from src/before.ts',
  'rename to src/after.ts',
].join('\n');

describe('parseUnifiedDiff', () => {
  it('returns an empty list for blank input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('   \n')).toEqual([]);
  });

  it('parses a modified file with line stats', () => {
    const [file] = parseUnifiedDiff(modifiedDiff);
    expect(file).toMatchObject({
      path: 'src/app.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
    });
    expect(file?.patch).toBe(modifiedDiff);
  });

  it('detects added and deleted files', () => {
    const [added] = parseUnifiedDiff(addedDiff);
    expect(added).toMatchObject({ path: 'docs/new.md', status: 'added', additions: 2, deletions: 0 });

    const [deleted] = parseUnifiedDiff(deletedDiff);
    expect(deleted).toMatchObject({ path: 'old.txt', status: 'deleted', additions: 0, deletions: 1 });
  });

  it('detects renames with the previous path', () => {
    const [renamed] = parseUnifiedDiff(renamedDiff);
    expect(renamed).toMatchObject({
      path: 'src/after.ts',
      previousPath: 'src/before.ts',
      status: 'renamed',
    });
  });

  it('splits multi-file diffs into per-file entries', () => {
    const files = parseUnifiedDiff([modifiedDiff, addedDiff, deletedDiff].join('\n'));
    expect(files.map((file) => file.path)).toEqual(['src/app.ts', 'docs/new.md', 'old.txt']);
  });

  it('handles quoted paths with spaces', () => {
    const diff = [
      'diff --git "a/dir with space/file.txt" "b/dir with space/file.txt"',
      'index 1111111..2222222 100644',
      '--- "a/dir with space/file.txt"',
      '+++ "b/dir with space/file.txt"',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    const [file] = parseUnifiedDiff(diff);
    expect(file).toMatchObject({ path: 'dir with space/file.txt', status: 'modified' });
  });
});
