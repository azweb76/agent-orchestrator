import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  ApplyInstructionFileRequest,
  ApplyInstructionFileResponse,
  InstructionFile,
  InstructionFileKind,
  InstructionFileScope,
} from '@agent-orchestrator/shared';

const SKILL_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface InstructionFileRoots {
  worktreePath: string;
  homeDir?: string;
}

function homeDirOf(roots: InstructionFileRoots): string {
  return roots.homeDir ?? os.homedir();
}

export function sanitizeSkillSlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  if (!SKILL_SLUG.test(slug)) {
    throw new Error('Invalid skill name; use lowercase letters, numbers, and hyphens');
  }
  return slug;
}

export function isAllowedInstructionRelativePath(
  kind: InstructionFileKind,
  relativePath: string,
): boolean {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '');
  if (kind === 'claude_md') {
    return normalized === 'CLAUDE.md' || normalized === '.claude/CLAUDE.md';
  }
  if (kind === 'agents_md') {
    return normalized === 'AGENTS.md';
  }
  return /^\.claude\/skills\/[a-z0-9][a-z0-9-]*\/SKILL\.md$/.test(normalized);
}

function assertInside(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes allowed directory');
  }
  return resolved;
}

export function resolveInstructionWritePath(
  roots: InstructionFileRoots,
  body: ApplyInstructionFileRequest,
): { absolutePath: string; relativePath: string; scope: InstructionFileScope } {
  const scope: InstructionFileScope = body.kind === 'skill' ? (body.scope ?? 'project') : 'project';
  let relativePath = (body.relativePath ?? '').replaceAll('\\', '/').replace(/^\/+/, '');

  if (relativePath) {
    if (!isAllowedInstructionRelativePath(body.kind, relativePath)) {
      throw new Error('Unsupported instruction file path');
    }
  } else if (body.kind === 'claude_md') {
    relativePath = 'CLAUDE.md';
  } else if (body.kind === 'agents_md') {
    relativePath = 'AGENTS.md';
  } else {
    const slug = sanitizeSkillSlug(body.name || 'session-lesson');
    relativePath = `.claude/skills/${slug}/SKILL.md`;
  }

  if (!isAllowedInstructionRelativePath(body.kind, relativePath)) {
    throw new Error('Unsupported instruction file path');
  }

  const root = scope === 'personal' ? homeDirOf(roots) : roots.worktreePath;
  const absolutePath = assertInside(root, path.join(root, relativePath));
  return { absolutePath, relativePath, scope };
}

function parseFrontmatter(markdown: string): { name?: string; description?: string } {
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

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function listSkillFiles(
  skillsRoot: string,
  scope: InstructionFileScope,
): Promise<InstructionFile[]> {
  try {
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name !== 'synced')
        .map(async (entry) => {
          const relativePath = `.claude/skills/${entry.name}/SKILL.md`;
          const markdown = await readOptional(path.join(skillsRoot, entry.name, 'SKILL.md'));
          if (markdown == null) return null;
          const meta = parseFrontmatter(markdown);
          return {
            kind: 'skill',
            scope,
            name: meta.name || entry.name,
            description: meta.description || `Skill: ${meta.name || entry.name}`,
            relativePath,
            exists: true,
          } as InstructionFile;
        }),
    );
    return files.filter((item): item is InstructionFile => item != null);
  } catch {
    return [];
  }
}

async function describeMarkdownFile(
  absolutePath: string,
  relativePath: string,
  kind: InstructionFileKind,
  fallbackDescription: string,
): Promise<InstructionFile> {
  const markdown = await readOptional(absolutePath);
  const exists = markdown != null;
  const firstLine = markdown
    ?.replace(/^---[\s\S]*?---\s*/, '')
    .trim()
    .split('\n')
    .find((line) => line.trim().length > 0);
  return {
    kind,
    scope: 'project',
    name: path.basename(relativePath),
    description: exists
      ? firstLine?.replace(/^#+\s*/, '').slice(0, 160) || fallbackDescription
      : fallbackDescription,
    relativePath,
    exists,
  };
}

export async function listInstructionFiles(roots: InstructionFileRoots): Promise<InstructionFile[]> {
  const worktree = path.resolve(roots.worktreePath);
  const home = homeDirOf(roots);
  const [claudeMd, claudeDot, agentsMd, projectSkills, personalSkills] = await Promise.all([
    describeMarkdownFile(path.join(worktree, 'CLAUDE.md'), 'CLAUDE.md', 'claude_md', 'Project agent instructions'),
    describeMarkdownFile(
      path.join(worktree, '.claude', 'CLAUDE.md'),
      '.claude/CLAUDE.md',
      'claude_md',
      'Project Claude instructions',
    ),
    describeMarkdownFile(path.join(worktree, 'AGENTS.md'), 'AGENTS.md', 'agents_md', 'Project agent instruction file'),
    listSkillFiles(path.join(worktree, '.claude', 'skills'), 'project'),
    listSkillFiles(path.join(home, '.claude', 'skills'), 'personal'),
  ]);

  const files: InstructionFile[] = [claudeMd, agentsMd];
  if (claudeDot.exists) files.push(claudeDot);
  files.push(...projectSkills, ...personalSkills);
  return files;
}

const MAX_INSTRUCTION_EXCERPT_CHARS = 2500;

export interface InstructionFileExcerpt extends InstructionFile {
  charCount: number;
  excerpt: string;
}

function clipExcerpt(text: string, max = MAX_INSTRUCTION_EXCERPT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

/** List instruction files with truncated content for session grading. */
export async function loadInstructionFileExcerpts(
  roots: InstructionFileRoots,
): Promise<InstructionFileExcerpt[]> {
  const files = await listInstructionFiles(roots);
  return Promise.all(
    files.map(async (file) => {
      if (!file.exists) {
        return { ...file, charCount: 0, excerpt: '' };
      }
      const content = (await readInstructionFileContent(roots, file)) ?? '';
      return {
        ...file,
        charCount: content.length,
        excerpt: clipExcerpt(content),
      };
    }),
  );
}

export async function readInstructionFileContent(
  roots: InstructionFileRoots,
  file: Pick<InstructionFile, 'kind' | 'scope' | 'relativePath'>,
): Promise<string | null> {
  const { absolutePath } = resolveInstructionWritePath(roots, {
    kind: file.kind,
    scope: file.scope,
    relativePath: file.relativePath,
    content: '',
  });
  return readOptional(absolutePath);
}

export async function applyInstructionFile(
  roots: InstructionFileRoots,
  body: ApplyInstructionFileRequest,
): Promise<ApplyInstructionFileResponse> {
  const content = body.content.trim();
  if (!content) throw new Error('Instruction file content is required');

  const { absolutePath, relativePath, scope } = resolveInstructionWritePath(roots, body);
  const existed = (await readOptional(absolutePath)) != null;
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');

  return {
    kind: body.kind,
    scope,
    relativePath,
    action: existed ? 'update' : 'create',
  };
}
