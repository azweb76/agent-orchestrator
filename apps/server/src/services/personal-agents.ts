import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  CreatePersonalAgentRequest,
  PersonalAgent,
  UpdatePersonalAgentRequest,
} from '@agent-orchestrator/shared';
import { sanitizeSkillSlug } from './instruction-files.js';
import { parseSkillFrontmatter } from './skill-dirs.js';

function agentsRoot(homeDir?: string): string {
  return path.join(homeDir ?? os.homedir(), '.claude', 'agents');
}

function agentAbsolutePath(homeDir: string | undefined, slug: string): string {
  const root = agentsRoot(homeDir);
  const dest = path.resolve(root, `${slug}.md`);
  const rel = path.relative(root, dest);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(`..${path.sep}`)) {
    throw new Error('Path escapes agents directory');
  }
  if (path.dirname(dest) !== path.resolve(root)) {
    throw new Error('Path escapes agents directory');
  }
  return dest;
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\s+/, '');
}

function extraFrontmatterFields(markdown: string): Record<string, string> {
  if (!markdown.startsWith('---')) return {};
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return {};
  const extra: Record<string, string> = {};
  for (const line of markdown.slice(3, end).trim().split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    const value = match[2]!.trim();
    const lower = key.toLowerCase();
    if (lower === 'name' || lower === 'description') continue;
    extra[key] = value;
  }
  return extra;
}

export function composeAgentMarkdown(
  name: string,
  description: string,
  content: string,
  extra: Record<string, string> = {},
): string {
  const body = stripFrontmatter(content).trim();
  const desc = description.trim().replace(/\s+/g, ' ');
  const lines = ['---', `name: ${name}`, `description: ${desc || name}`];
  for (const [key, value] of Object.entries(extra)) {
    if (key.toLowerCase() === 'name' || key.toLowerCase() === 'description') continue;
    lines.push(`${key}: ${value}`);
  }
  lines.push('---', '');
  return body ? `${lines.join('\n')}${body}\n` : `${lines.join('\n')}`;
}

async function toPersonalAgent(homeDir: string | undefined, slug: string): Promise<PersonalAgent> {
  const absolutePath = agentAbsolutePath(homeDir, slug);
  let content: string;
  try {
    content = await fs.readFile(absolutePath, 'utf8');
  } catch {
    throw new Error('Agent not found');
  }
  if (!content) throw new Error('Agent not found');
  const meta = parseSkillFrontmatter(content);
  return {
    slug,
    name: meta.name || slug,
    description: meta.description || `Agent: ${meta.name || slug}`,
    relativePath: `.claude/agents/${slug}.md`,
    content,
  };
}

export async function listPersonalAgents(homeDir?: string): Promise<PersonalAgent[]> {
  let entries;
  try {
    entries = await fs.readdir(agentsRoot(homeDir), { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: PersonalAgent[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const slug = entry.name.slice(0, -'.md'.length).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) continue;
    try {
      agents.push(await toPersonalAgent(homeDir, slug));
    } catch {
      // Skip unreadable files
    }
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPersonalAgent(slug: string, homeDir?: string): Promise<PersonalAgent> {
  return toPersonalAgent(homeDir, sanitizeSkillSlug(slug));
}

export async function createPersonalAgent(
  body: CreatePersonalAgentRequest,
  homeDir?: string,
): Promise<PersonalAgent> {
  const displayName = body.name.trim();
  const slug = sanitizeSkillSlug(body.name);
  const dest = agentAbsolutePath(homeDir, slug);
  const exists = await fs.access(dest).then(
    () => true,
    () => false,
  );
  if (exists) throw new Error(`Agent already exists: ${slug}`);

  const extra = extraFrontmatterFields(body.content);
  const content = composeAgentMarkdown(displayName, body.description ?? '', body.content, extra);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, content, 'utf8');
  return toPersonalAgent(homeDir, slug);
}

export async function updatePersonalAgent(
  slug: string,
  body: UpdatePersonalAgentRequest,
  homeDir?: string,
): Promise<PersonalAgent> {
  const current = await getPersonalAgent(slug, homeDir);
  const nextName = (body.name ?? current.name).trim() || current.slug;
  const nextDescription = body.description ?? current.description;
  const nextBody = body.content ?? current.content;
  const extraSource = body.content?.startsWith('---') ? body.content : current.content;
  const extra = extraFrontmatterFields(extraSource);
  const content = composeAgentMarkdown(nextName, nextDescription, nextBody, extra);
  await fs.writeFile(agentAbsolutePath(homeDir, current.slug), content, 'utf8');
  return toPersonalAgent(homeDir, current.slug);
}

export async function deletePersonalAgent(slug: string, homeDir?: string): Promise<void> {
  const current = await getPersonalAgent(slug, homeDir);
  await fs.rm(agentAbsolutePath(homeDir, current.slug), { force: true });
}
