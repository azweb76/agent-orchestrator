import { PATH_SEGMENT_PATTERN } from './github/constants.js';

export interface RepoAgentFile {
  slug: string;
  relativePath: string;
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\/+/, '');
}

/**
 * Claude Code user/project subagents: `.claude/agents/<slug>.md` or `agents/<slug>.md`.
 * Prefer the `.claude/` path when both exist for the same slug.
 */
export function findAgentFiles(filePaths: string[]): RepoAgentFile[] {
  const files = new Map<string, { file: RepoAgentFile; score: number }>();
  for (const raw of filePaths) {
    const filePath = normalizeRepoPath(raw);
    if (filePath.split('/').includes('..')) continue;
    const match = filePath.match(/^(?:(\.claude\/))?agents\/([^/]+)\.md$/i);
    if (!match) continue;
    const folder = match[2]!;
    const slug = folder.toLowerCase();
    if (!PATH_SEGMENT_PATTERN.test(folder) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) continue;
    const score = match[1] ? 2 : 1;
    const existing = files.get(slug);
    if (existing && existing.score >= score) continue;
    files.set(slug, { file: { slug, relativePath: filePath }, score });
  }
  return [...files.values()]
    .map((entry) => entry.file)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
