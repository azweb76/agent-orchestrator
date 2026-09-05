import { v4 as uuidv4 } from 'uuid';
import type {
  CreateTaskFollowUpRequest,
  TaskFollowUp,
  UpdateTaskFollowUpRequest,
} from '@agent-orchestrator/shared';
import {
  BUILTIN_TASK_FOLLOWUPS,
  chatSessionTemplateById,
  isValidTaskFollowUpName,
} from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';

export function listTaskFollowUps(ctx: AppContext): TaskFollowUp[] {
  ensureBuiltInTaskFollowUps(ctx);
  return ctx.repos.taskFollowUps.list();
}

export function listEnabledTaskFollowUps(ctx: AppContext): TaskFollowUp[] {
  return ctx.repos.taskFollowUps.listEnabled();
}

export function getTaskFollowUp(ctx: AppContext, id: string): TaskFollowUp {
  const followUp = ctx.repos.taskFollowUps.getById(id);
  if (!followUp) throw new Error('Follow-up not found');
  return followUp;
}

function normalizeTemplate(
  kind: TaskFollowUp['kind'],
  template: TaskFollowUp['template'] | undefined,
): TaskFollowUp['template'] {
  if (kind !== 'start-template') return null;
  if (!template) {
    throw new Error('Template is required when kind is start-template');
  }
  if (!chatSessionTemplateById(template)) {
    throw new Error(`Unknown session template "${template}"`);
  }
  return template;
}

export function createTaskFollowUp(
  ctx: AppContext,
  body: CreateTaskFollowUpRequest,
): TaskFollowUp {
  const name = body.name.trim().toLowerCase();
  if (!isValidTaskFollowUpName(name)) {
    throw new Error('Follow-up name must be a lowercase slug (a-z, 0-9, hyphens)');
  }
  if (ctx.repos.taskFollowUps.getByName(name)) {
    throw new Error(`A follow-up named "${name}" already exists`);
  }
  const title = body.title.trim();
  if (!title) throw new Error('Title is required');
  const prompt = body.prompt.trim();
  if (!prompt) throw new Error('Prompt is required');

  const kind = body.kind ?? 'prompt';
  const now = nowIso();
  return ctx.repos.taskFollowUps.create({
    id: uuidv4(),
    name,
    title,
    description: body.description?.trim() ?? '',
    prompt,
    kind,
    template: normalizeTemplate(kind, body.template ?? null),
    enabled: body.enabled ?? true,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateTaskFollowUp(
  ctx: AppContext,
  id: string,
  body: UpdateTaskFollowUpRequest,
): TaskFollowUp {
  const current = getTaskFollowUp(ctx, id);
  let name = current.name;
  if (body.name != null && !current.builtIn) {
    const next = body.name.trim().toLowerCase();
    if (!isValidTaskFollowUpName(next)) {
      throw new Error('Follow-up name must be a lowercase slug (a-z, 0-9, hyphens)');
    }
    const conflict = ctx.repos.taskFollowUps.getByName(next);
    if (conflict && conflict.id !== id) {
      throw new Error(`A follow-up named "${next}" already exists`);
    }
    name = next;
  }

  const title = body.title != null ? body.title.trim() : current.title;
  if (!title) throw new Error('Title is required');
  const prompt = body.prompt != null ? body.prompt.trim() : current.prompt;
  if (!prompt) throw new Error('Prompt is required');

  const kind = body.kind ?? current.kind;
  const template =
    body.template !== undefined || body.kind !== undefined
      ? normalizeTemplate(kind, body.template !== undefined ? body.template : current.template)
      : current.template;

  return ctx.repos.taskFollowUps.update({
    ...current,
    name,
    title,
    description: body.description != null ? body.description.trim() : current.description,
    prompt,
    kind,
    template,
    enabled: body.enabled ?? current.enabled,
    updatedAt: nowIso(),
  });
}

export function deleteTaskFollowUp(ctx: AppContext, id: string): void {
  const followUp = getTaskFollowUp(ctx, id);
  if (followUp.builtIn) {
    throw new Error(`Built-in follow-up "${followUp.name}" cannot be deleted`);
  }
  ctx.repos.taskFollowUps.delete(id);
}

/** Insert any missing built-in follow-ups (idempotent). Does not overwrite user edits. */
export function ensureBuiltInTaskFollowUps(ctx: AppContext): void {
  const now = nowIso();
  for (const seed of BUILTIN_TASK_FOLLOWUPS) {
    if (ctx.repos.taskFollowUps.getByName(seed.name)) continue;
    ctx.repos.taskFollowUps.create({
      id: uuidv4(),
      name: seed.name,
      title: seed.title,
      description: seed.description,
      prompt: seed.prompt,
      kind: seed.kind,
      template: seed.template ?? null,
      enabled: true,
      builtIn: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}
