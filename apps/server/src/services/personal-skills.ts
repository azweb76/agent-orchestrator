import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  CreatePersonalSkillRequest,
  PersonalSkill,
  UpdatePersonalSkillRequest,
} from '@agent-orchestrator/shared';
import {
  applyInstructionFile,
  readInstructionFileContent,
  resolveInstructionWritePath,
  sanitizeSkillSlug,
  type InstructionFileRoots,
} from './instruction-files.js';

function personalRoots(homeDir?: string): InstructionFileRoots {
  const home = homeDir ?? os.homedir();
  return { worktreePath: home, homeDir: home };
}

function slugFromRelativePath(relativePath: string): string {
  const match = relativePath.match(/^\.claude\/skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md$/);
  if (!match?.[1]) throw new Error('Skill not found');
  return match[1];
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\s+/, '');
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

export function composeSkillMarkdown(
  name: string,
  description: string,
  content: string,
): string {
  const body = stripFrontmatter(content).trim();
  const desc = description.trim().replace(/\s+/g, ' ');
  const lines = ['---', `name: ${name}`, `description: ${desc || name}`, '---', ''];
  return body ? `${lines.join('\n')}${body}\n` : `${lines.join('\n')}`;
}

async function toPersonalSkill(
  roots: InstructionFileRoots,
  relativePath: string,
): Promise<PersonalSkill> {
  const slug = slugFromRelativePath(relativePath);
  const content =
    (await readInstructionFileContent(roots, {
      kind: 'skill',
      scope: 'personal',
      relativePath,
    })) ?? '';
  if (!content) throw new Error('Skill not found');
  const meta = parseFrontmatter(content);
  return {
    slug,
    name: meta.name || slug,
    description: meta.description || `Skill: ${meta.name || slug}`,
    relativePath,
    content,
  };
}

export async function listPersonalSkills(homeDir?: string): Promise<PersonalSkill[]> {
  const roots = personalRoots(homeDir);
  const skillsRoot = path.join(roots.homeDir ?? os.homedir(), '.claude', 'skills');
  let entries;
  try {
    entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: PersonalSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'synced') continue;
    try {
      skills.push(await toPersonalSkill(roots, `.claude/skills/${entry.name}/SKILL.md`));
    } catch {
      // Skip folders without SKILL.md
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPersonalSkill(slug: string, homeDir?: string): Promise<PersonalSkill> {
  const roots = personalRoots(homeDir);
  return toPersonalSkill(roots, `.claude/skills/${sanitizeSkillSlug(slug)}/SKILL.md`);
}

export async function createPersonalSkill(
  body: CreatePersonalSkillRequest,
  homeDir?: string,
): Promise<PersonalSkill> {
  const displayName = body.name.trim();
  const slug = sanitizeSkillSlug(body.name);
  const roots = personalRoots(homeDir);
  const relativePath = `.claude/skills/${slug}/SKILL.md`;
  const existing = await readInstructionFileContent(roots, {
    kind: 'skill',
    scope: 'personal',
    relativePath,
  });
  if (existing != null) {
    throw new Error(`Skill already exists: ${slug}`);
  }

  const content = composeSkillMarkdown(displayName, body.description ?? '', body.content);
  await applyInstructionFile(roots, {
    kind: 'skill',
    scope: 'personal',
    name: slug,
    content,
  });
  return toPersonalSkill(roots, relativePath);
}

export async function updatePersonalSkill(
  slug: string,
  body: UpdatePersonalSkillRequest,
  homeDir?: string,
): Promise<PersonalSkill> {
  const current = await getPersonalSkill(slug, homeDir);
  const roots = personalRoots(homeDir);
  const nextName = (body.name ?? current.name).trim() || current.slug;
  const nextDescription = body.description ?? current.description;
  const nextBody = body.content ?? current.content;
  const content = composeSkillMarkdown(nextName, nextDescription, nextBody);
  await applyInstructionFile(roots, {
    kind: 'skill',
    scope: 'personal',
    relativePath: current.relativePath,
    content,
  });
  return toPersonalSkill(roots, current.relativePath);
}

export async function deletePersonalSkill(slug: string, homeDir?: string): Promise<void> {
  const current = await getPersonalSkill(slug, homeDir);
  const roots = personalRoots(homeDir);
  const { absolutePath } = resolveInstructionWritePath(roots, {
    kind: 'skill',
    scope: 'personal',
    relativePath: current.relativePath,
  });
  await fs.rm(path.dirname(absolutePath), { recursive: true, force: true });
}
