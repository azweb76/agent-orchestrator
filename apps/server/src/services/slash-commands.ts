import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BUNDLED_SKILL_COMMANDS,
  LOCAL_SLASH_COMMANDS,
  PROMPT_SLASH_COMMANDS,
  type SlashCommand,
} from '@agent-orchestrator/shared';

function normalizeCommandName(raw: string): string {
  const trimmed = raw.trim().replace(/^\//, '');
  return `/${trimmed}`;
}

function parseFrontmatter(markdown: string): { name?: string; description?: string } {
  if (!markdown.startsWith('---')) return {};
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = markdown.slice(3, end).trim();
  const result: { name?: string; description?: string } = {};
  for (const line of block.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim().replace(/^['"]|['"]$/g, '');
    if (key === 'name' && value) result.name = value;
    if (key === 'description' && value) result.description = value;
  }
  return result;
}

async function readSkillFromDir(
  dir: string,
  source: SlashCommand['source'],
): Promise<SlashCommand | null> {
  const skillPath = path.join(dir, 'SKILL.md');
  try {
    const markdown = await fs.readFile(skillPath, 'utf8');
    const meta = parseFrontmatter(markdown);
    const folderName = path.basename(dir);
    const command = normalizeCommandName(meta.name || folderName);
    return {
      command,
      description: meta.description || `Skill: ${command.slice(1)}`,
      kind: 'skill',
      source,
    };
  } catch {
    return null;
  }
}

async function readCommandFile(
  filePath: string,
  source: SlashCommand['source'],
): Promise<SlashCommand | null> {
  try {
    const markdown = await fs.readFile(filePath, 'utf8');
    const meta = parseFrontmatter(markdown);
    const base = path.basename(filePath, path.extname(filePath));
    const command = normalizeCommandName(meta.name || base);
    const firstLine = markdown
      .replace(/^---[\s\S]*?---\s*/, '')
      .trim()
      .split('\n')
      .find((line) => line.trim().length > 0);
    return {
      command,
      description: meta.description || firstLine?.replace(/^#+\s*/, '').slice(0, 120) || `Command: ${command.slice(1)}`,
      kind: 'skill',
      source,
    };
  } catch {
    return null;
  }
}

async function listSkillDirs(root: string, source: SlashCommand['source']): Promise<SlashCommand[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name !== 'synced')
        .map((entry) => readSkillFromDir(path.join(root, entry.name), source)),
    );
    return skills.filter((item): item is SlashCommand => item != null);
  } catch {
    return [];
  }
}

async function listCommandFiles(root: string, source: SlashCommand['source']): Promise<SlashCommand[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const commands = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => readCommandFile(path.join(root, entry.name), source)),
    );
    return commands.filter((item): item is SlashCommand => item != null);
  } catch {
    return [];
  }
}

/**
 * Discover slash commands/skills available for a Claude worktree cwd.
 * Precedence (later wins on name collision): bundled → prompt shortcuts → personal → project → local.
 */
export async function discoverSlashCommands(worktreePath: string): Promise<SlashCommand[]> {
  const home = os.homedir();
  const [projectSkills, projectCommands, personalSkills, personalCommands] = await Promise.all([
    listSkillDirs(path.join(worktreePath, '.claude', 'skills'), 'project'),
    listCommandFiles(path.join(worktreePath, '.claude', 'commands'), 'project'),
    listSkillDirs(path.join(home, '.claude', 'skills'), 'personal'),
    listCommandFiles(path.join(home, '.claude', 'commands'), 'personal'),
  ]);

  const byCommand = new Map<string, SlashCommand>();
  const upsert = (item: SlashCommand) => {
    byCommand.set(item.command.toLowerCase(), item);
  };

  for (const item of BUNDLED_SKILL_COMMANDS) upsert(item);
  for (const item of PROMPT_SLASH_COMMANDS) upsert(item);
  for (const item of personalCommands) upsert(item);
  for (const item of personalSkills) upsert(item);
  for (const item of projectCommands) upsert(item);
  for (const item of projectSkills) upsert(item);
  for (const item of LOCAL_SLASH_COMMANDS) upsert(item);

  return [...byCommand.values()].sort((a, b) => a.command.localeCompare(b.command));
}

export function findSlashCommand(
  commands: SlashCommand[],
  text: string,
): SlashCommand | undefined {
  const token = text.trim().split(/\s+/)[0]?.toLowerCase();
  if (!token?.startsWith('/')) return undefined;

  const exact = commands.find((item) => item.command.toLowerCase() === token);
  if (exact) return exact;

  return commands.find((item) => item.aliases?.some((alias) => alias.toLowerCase() === token));
}

export function filterSlashCommands(commands: SlashCommand[], draft: string): SlashCommand[] {
  const token = draft.trim().split(/\s+/)[0] ?? '';
  if (!token.startsWith('/')) return [];
  const needle = token.toLowerCase();
  return commands
    .filter((item) => {
      if (item.command.toLowerCase().startsWith(needle)) return true;
      return item.aliases?.some((alias) => alias.toLowerCase().startsWith(needle)) ?? false;
    })
    .slice(0, 12);
}
