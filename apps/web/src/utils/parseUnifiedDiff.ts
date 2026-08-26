export type DiffFileStatus = 'added' | 'deleted' | 'modified' | 'renamed';

export interface DiffFile {
  /** Path shown in the tree (new path for renames). */
  path: string;
  previousPath?: string;
  status: DiffFileStatus;
  /** Full unified-diff chunk for this file, including the `diff --git` header. */
  patch: string;
  additions: number;
  deletions: number;
}

/** Strip the `a/` or `b/` prefix git uses in diff paths; keep `/dev/null` as-is. */
function stripDiffPrefix(raw: string): string {
  if (raw === '/dev/null') return raw;
  if (raw.startsWith('a/') || raw.startsWith('b/')) return raw.slice(2);
  return raw;
}

/** Read one git path token (quoted or unquoted) from a `diff --git` remainder. */
function takePathToken(input: string): { token: string; rest: string } | null {
  const s = input.trimStart();
  if (!s) return null;
  if (s.startsWith('"')) {
    let i = 1;
    let out = '';
    while (i < s.length) {
      const ch = s[i]!;
      if (ch === '\\' && i + 1 < s.length) {
        out += s[i + 1]!;
        i += 2;
        continue;
      }
      if (ch === '"') return { token: out, rest: s.slice(i + 1) };
      out += ch;
      i += 1;
    }
    return null;
  }
  const space = s.indexOf(' ');
  if (space === -1) return { token: s, rest: '' };
  return { token: s.slice(0, space), rest: s.slice(space + 1) };
}

function parseGitPaths(header: string): { oldPath: string; newPath: string } | null {
  if (!header.startsWith('diff --git ')) return null;
  const first = takePathToken(header.slice('diff --git '.length));
  if (!first) return null;
  const second = takePathToken(first.rest);
  if (!second) return null;
  return {
    oldPath: stripDiffPrefix(first.token),
    newPath: stripDiffPrefix(second.token),
  };
}

function countLineStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}

function detectStatus(
  chunk: string,
  oldPath: string,
  newPath: string,
): { status: DiffFileStatus; path: string; previousPath?: string } {
  if (/^new file mode /m.test(chunk) || oldPath === '/dev/null') {
    return { status: 'added', path: newPath === '/dev/null' ? oldPath : newPath };
  }
  if (/^deleted file mode /m.test(chunk) || newPath === '/dev/null') {
    return { status: 'deleted', path: oldPath === '/dev/null' ? newPath : oldPath };
  }
  const renameTo = /^rename to (.+)$/m.exec(chunk);
  const renameFrom = /^rename from (.+)$/m.exec(chunk);
  if (renameTo || renameFrom || (oldPath !== newPath && oldPath !== '/dev/null' && newPath !== '/dev/null')) {
    return {
      status: 'renamed',
      path: newPath,
      previousPath: renameFrom ? stripDiffPrefix(renameFrom[1]!.trim()) : oldPath,
    };
  }
  return { status: 'modified', path: newPath };
}

/** Split a multi-file unified diff into per-file entries. */
export function parseUnifiedDiff(patch: string): DiffFile[] {
  if (!patch.trim()) return [];

  const lines = patch.split('\n');
  const files: DiffFile[] = [];
  let start = -1;

  const flush = (end: number) => {
    if (start < 0) return;
    const chunk = lines.slice(start, end).join('\n');
    const header = lines[start] ?? '';
    const paths = parseGitPaths(header);
    if (!paths) {
      start = -1;
      return;
    }
    const { status, path, previousPath } = detectStatus(chunk, paths.oldPath, paths.newPath);
    const { additions, deletions } = countLineStats(chunk);
    files.push({ path, previousPath, status, patch: chunk, additions, deletions });
    start = -1;
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.startsWith('diff --git ')) {
      flush(i);
      start = i;
    }
  }
  flush(lines.length);

  return files;
}
