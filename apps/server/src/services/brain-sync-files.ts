import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { AgentTask, TaskFollowUp } from '@agent-orchestrator/shared';
import {
  clampImportedPermissionMode,
  isValidAgentTaskName,
  isValidTaskFollowUpName,
  sanitizeImportedAllowedTools,
  SELECTABLE_CLAUDE_TOOL_IDS,
} from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';
import { applyInstructionFile, sanitizeSkillSlug } from './instruction-files.js';
import { deletePersonalSkill, listPersonalSkills } from './personal-skills.js';
import { ensureBuiltInAgentTasks } from './agent-tasks.js';
import { ensureBuiltInTaskFollowUps } from './task-followups.js';

export const BRAIN_SKILLS_DIR = 'skills';
export const BRAIN_TASKS_DIR = 'tasks';
export const BRAIN_FOLLOW_UPS_DIR = 'follow-ups';

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const PERMISSION_MODES = new Set([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
]);
const FOLLOW_UP_KINDS = new Set(['prompt', 'commit-and-push', 'start-template', 'grade-session']);
const FOLLOW_UP_TRIGGERS = new Set(['session-complete', 'exit-plan-mode']);

export interface BrainTaskFile {
  name: string;
  title: string;
  description: string;
  purpose: string;
  promptTemplate: string | null;
  systemPrompt: string | null;
  allowedTools: string | null;
  model: string;
  effort: AgentTask['effort'];
  permissionMode: AgentTask['permissionMode'];
  listed: boolean;
  builtIn: boolean;
}

export interface BrainFollowUpFile {
  name: string;
  title: string;
  description: string;
  prompt: string;
  kind: TaskFollowUp['kind'];
  template: TaskFollowUp['template'];
  enabled: boolean;
  trigger: TaskFollowUp['trigger'];
  builtIn: boolean;
}

export function taskToFile(task: AgentTask): BrainTaskFile {
  return {
    name: task.name,
    title: task.title,
    description: task.description,
    purpose: task.purpose,
    promptTemplate: task.promptTemplate,
    systemPrompt: task.systemPrompt,
    allowedTools: task.allowedTools,
    model: task.model,
    effort: task.effort,
    permissionMode: task.permissionMode,
    listed: task.listed,
    builtIn: task.builtIn,
  };
}

export function followUpToFile(followUp: TaskFollowUp): BrainFollowUpFile {
  return {
    name: followUp.name,
    title: followUp.title,
    description: followUp.description,
    prompt: followUp.prompt,
    kind: followUp.kind,
    template: followUp.template,
    enabled: followUp.enabled,
    trigger: followUp.trigger,
    builtIn: followUp.builtIn,
  };
}

export function stringifyBrainJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function parseTaskFile(raw: unknown): BrainTaskFile | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name).trim().toLowerCase();
  if (!isValidAgentTaskName(name)) return null;
  const title = asString(raw.title).trim();
  if (!title) return null;
  const effort = asString(raw.effort, 'high');
  const permissionMode = asString(raw.permissionMode, 'plan');
  if (!EFFORTS.has(effort) || !PERMISSION_MODES.has(permissionMode)) return null;
  // The file comes from a synced repository, so it does not get to pick a mode
  // that auto-approves tools, nor to name a tool outside the catalog.
  const { mode: clampedMode } = clampImportedPermissionMode(permissionMode);
  return {
    name,
    title,
    description: asString(raw.description),
    purpose: asString(raw.purpose),
    promptTemplate: asNullableString(raw.promptTemplate),
    systemPrompt: asNullableString(raw.systemPrompt),
    allowedTools: sanitizeImportedAllowedTools(
      asNullableString(raw.allowedTools),
      SELECTABLE_CLAUDE_TOOL_IDS,
    ),
    model: asString(raw.model, 'sonnet').trim() || 'sonnet',
    effort: effort as BrainTaskFile['effort'],
    permissionMode: clampedMode,
    listed: asBool(raw.listed, false),
    builtIn: asBool(raw.builtIn, false),
  };
}

export function parseFollowUpFile(raw: unknown): BrainFollowUpFile | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name).trim().toLowerCase();
  if (!isValidTaskFollowUpName(name)) return null;
  const title = asString(raw.title).trim();
  const prompt = asString(raw.prompt).trim();
  if (!title || !prompt) return null;
  const kind = asString(raw.kind, 'prompt');
  if (!FOLLOW_UP_KINDS.has(kind)) return null;
  const template = raw.template == null ? null : asString(raw.template);
  // Library files written before triggers existed have no `trigger`; default rather than
  // reject so an older repo still imports.
  const trigger = asString(raw.trigger, 'session-complete');
  return {
    name,
    title,
    description: asString(raw.description),
    prompt,
    kind: kind as BrainFollowUpFile['kind'],
    template: kind === 'start-template' ? (template as TaskFollowUp['template']) : null,
    enabled: asBool(raw.enabled, true),
    trigger: FOLLOW_UP_TRIGGERS.has(trigger)
      ? (trigger as BrainFollowUpFile['trigger'])
      : 'session-complete',
    builtIn: asBool(raw.builtIn, false),
  };
}

async function readJsonFiles(dir: string): Promise<unknown[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const values: unknown[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const text = await fs.readFile(path.join(dir, entry.name), 'utf8');
      values.push(JSON.parse(text) as unknown);
    } catch {
      // skip invalid json
    }
  }
  return values;
}

async function replaceDirFiles(dir: string, files: Map<string, string>): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!files.has(entry.name)) {
      await fs.rm(path.join(dir, entry.name), { force: true });
    }
  }
  for (const [name, content] of files) {
    await fs.writeFile(path.join(dir, name), content);
  }
}

async function replaceSkillDirs(skillsRoot: string, skills: Map<string, string>): Promise<void> {
  await fs.mkdir(skillsRoot, { recursive: true });
  let entries: Dirent[];
  try {
    entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!skills.has(entry.name)) {
      await fs.rm(path.join(skillsRoot, entry.name), { recursive: true, force: true });
    }
  }
  for (const [slug, content] of skills) {
    const dir = path.join(skillsRoot, slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), content);
  }
}

export async function materializeBrainRepo(
  ctx: AppContext,
  repoPath: string,
  homeDir?: string,
): Promise<void> {
  ensureBuiltInAgentTasks(ctx);
  ensureBuiltInTaskFollowUps(ctx);

  const taskFiles = new Map<string, string>();
  for (const task of ctx.repos.agentTasks.list()) {
    taskFiles.set(`${task.name}.json`, stringifyBrainJson(taskToFile(task)));
  }
  await replaceDirFiles(path.join(repoPath, BRAIN_TASKS_DIR), taskFiles);

  const followUpFiles = new Map<string, string>();
  for (const followUp of ctx.repos.taskFollowUps.list()) {
    followUpFiles.set(`${followUp.name}.json`, stringifyBrainJson(followUpToFile(followUp)));
  }
  await replaceDirFiles(path.join(repoPath, BRAIN_FOLLOW_UPS_DIR), followUpFiles);

  const skillFiles = new Map<string, string>();
  for (const skill of await listPersonalSkills(homeDir)) {
    skillFiles.set(skill.slug, skill.content.endsWith('\n') ? skill.content : `${skill.content}\n`);
  }
  await replaceSkillDirs(path.join(repoPath, BRAIN_SKILLS_DIR), skillFiles);
}

function repoHasCatalog(entries: string[]): boolean {
  return (
    entries.includes(BRAIN_SKILLS_DIR) ||
    entries.includes(BRAIN_TASKS_DIR) ||
    entries.includes(BRAIN_FOLLOW_UPS_DIR)
  );
}

export async function brainRepoHasCatalog(repoPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(repoPath);
    return repoHasCatalog(entries);
  } catch {
    return false;
  }
}

export async function importBrainRepo(
  ctx: AppContext,
  repoPath: string,
  homeDir?: string,
): Promise<void> {
  ensureBuiltInAgentTasks(ctx);
  ensureBuiltInTaskFollowUps(ctx);
  const now = nowIso();

  const taskPayloads = (await readJsonFiles(path.join(repoPath, BRAIN_TASKS_DIR)))
    .map(parseTaskFile)
    .filter((item): item is BrainTaskFile => item != null);
  const taskNames = new Set(taskPayloads.map((item) => item.name));
  for (const file of taskPayloads) {
    const existing = ctx.repos.agentTasks.getByName(file.name);
    if (existing) {
      ctx.repos.agentTasks.update({
        ...existing,
        ...file,
        name: existing.builtIn ? existing.name : file.name,
        builtIn: existing.builtIn || file.builtIn,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
    } else {
      ctx.repos.agentTasks.create({
        id: uuidv4(),
        ...file,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  for (const task of ctx.repos.agentTasks.list()) {
    if (!task.builtIn && !taskNames.has(task.name) && taskPayloads.length > 0) {
      ctx.repos.agentTasks.delete(task.id);
    }
  }

  const followPayloads = (await readJsonFiles(path.join(repoPath, BRAIN_FOLLOW_UPS_DIR)))
    .map(parseFollowUpFile)
    .filter((item): item is BrainFollowUpFile => item != null);
  const followNames = new Set(followPayloads.map((item) => item.name));
  for (const file of followPayloads) {
    const existing = ctx.repos.taskFollowUps.getByName(file.name);
    if (existing) {
      ctx.repos.taskFollowUps.update({
        ...existing,
        ...file,
        name: existing.builtIn ? existing.name : file.name,
        builtIn: existing.builtIn || file.builtIn,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
    } else {
      ctx.repos.taskFollowUps.create({
        id: uuidv4(),
        ...file,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  for (const followUp of ctx.repos.taskFollowUps.list()) {
    if (!followUp.builtIn && !followNames.has(followUp.name) && followPayloads.length > 0) {
      ctx.repos.taskFollowUps.delete(followUp.id);
    }
  }

  const skillsRoot = path.join(repoPath, BRAIN_SKILLS_DIR);
  let skillDirs: string[];
  try {
    skillDirs = (await fs.readdir(skillsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== 'synced')
      .map((entry) => entry.name);
  } catch {
    skillDirs = [];
  }
  const remoteSlugs = new Set<string>();
  for (const slug of skillDirs) {
    let content: string;
    try {
      content = await fs.readFile(path.join(skillsRoot, slug, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    let safeSlug: string;
    try {
      safeSlug = sanitizeSkillSlug(slug);
    } catch {
      continue;
    }
    remoteSlugs.add(safeSlug);
    const home = homeDir ?? os.homedir();
    await applyInstructionFile(
      { worktreePath: home, homeDir: home },
      {
        kind: 'skill',
        scope: 'personal',
        name: safeSlug,
        relativePath: `.claude/skills/${safeSlug}/SKILL.md`,
        content,
      },
    );
  }
  if (skillDirs.length > 0) {
    for (const skill of await listPersonalSkills(homeDir)) {
      if (!remoteSlugs.has(skill.slug)) {
        await deletePersonalSkill(skill.slug, homeDir);
      }
    }
  }
}
