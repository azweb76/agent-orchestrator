import { PATH_SEGMENT_PATTERN } from './github/constants.js';

export interface RepoSkillDir {
  slug: string;
  dirPath: string;
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\/+/, '');
}

/**
 * Directories that contain a SKILL.md Claude can load:
 * `.claude/skills/<slug>/`, `skills/<slug>/`, or a repo-root SKILL.md.
 */
export function findSkillDirs(filePaths: string[], fallbackSlug?: string): RepoSkillDir[] {
  const dirs = new Map<string, RepoSkillDir>();
  for (const raw of filePaths) {
    const filePath = normalizeRepoPath(raw);
    const nested = filePath.match(/^(?:\.claude\/)?skills\/([^/]+)\/SKILL\.md$/);
    if (nested) {
      const folder = nested[1]!;
      if (folder === 'synced') continue;
      const slug = folder.toLowerCase();
      if (!PATH_SEGMENT_PATTERN.test(folder) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) continue;
      const dirPath = filePath.slice(0, -'/SKILL.md'.length);
      if (!dirs.has(slug)) dirs.set(slug, { slug, dirPath });
      continue;
    }
    if (filePath === 'SKILL.md' && fallbackSlug) {
      const slug = fallbackSlug.toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) continue;
      if (!dirs.has(slug)) dirs.set(slug, { slug, dirPath: '' });
    }
  }
  return [...dirs.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function parseRepoSkillSource(input: string): { owner: string; repo: string } {
  const cleaned = input.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const shorthand = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthand && !cleaned.toLowerCase().includes('github.com')) {
    const owner = shorthand[1]!;
    const repo = shorthand[2]!;
    if (!PATH_SEGMENT_PATTERN.test(owner) || !PATH_SEGMENT_PATTERN.test(repo)) {
      throw new Error('Invalid GitHub repository');
    }
    return { owner, repo };
  }
  const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!match) throw new Error('Invalid GitHub repository URL');
  const owner = match[1]!;
  const repo = match[2]!;
  if (!PATH_SEGMENT_PATTERN.test(owner) || !PATH_SEGMENT_PATTERN.test(repo)) {
    throw new Error('Invalid GitHub repository');
  }
  return { owner, repo };
}

export function parseSkillFrontmatter(markdown: string): { name?: string; description?: string } {
  if (!markdown.startsWith('---')) return {};
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return {};
  const result: { name?: string; description?: string } = {};
  for (const line of markdown.slice(3, end).trim().split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim().replace(/^['"]|['"]$/g, '');
    if (key === 'name' && value) result.name = value;
    if (key === 'description' && value) result.description = value;
  }
  return result;
}

export function skillRelativeFiles(filePaths: string[], dirPath: string): string[] {
  const normalized = filePaths.map(normalizeRepoPath);
  if (!dirPath) {
    return normalized.filter((filePath) => filePath === 'SKILL.md');
  }
  const prefix = `${dirPath.replace(/\/$/, '')}/`;
  return normalized.filter(
    (filePath) => filePath.startsWith(prefix) && !filePath.split('/').includes('..'),
  );
}
