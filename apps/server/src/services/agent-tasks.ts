import { v4 as uuidv4 } from 'uuid';
import type {
  AgentTask,
  CreateAgentTaskRequest,
  UpdateAgentTaskRequest,
} from '@agent-orchestrator/shared';
import {
  isValidAgentTaskName,
  sanitizeAgentTaskAllowedTools,
} from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';

export function listAgentTasks(ctx: AppContext): AgentTask[] {
  return ctx.repos.agentTasks.list();
}

export function getAgentTask(ctx: AppContext, id: string): AgentTask {
  const task = ctx.repos.agentTasks.getById(id);
  if (!task) throw new Error('Agent task not found');
  return task;
}

export function requireAgentTaskByName(ctx: AppContext, name: string): AgentTask {
  const task = ctx.repos.agentTasks.getByName(name.trim());
  if (!task) throw new Error(`Task "${name}" not found`);
  return task;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function createAgentTask(ctx: AppContext, body: CreateAgentTaskRequest): AgentTask {
  const name = body.name.trim().toLowerCase();
  if (!isValidAgentTaskName(name)) {
    throw new Error('Task name must be a lowercase slug (a-z, 0-9, hyphens)');
  }
  if (ctx.repos.agentTasks.getByName(name)) {
    throw new Error(`A task named "${name}" already exists`);
  }
  const title = body.title.trim();
  if (!title) throw new Error('Title is required');

  const now = nowIso();
  return ctx.repos.agentTasks.create({
    id: uuidv4(),
    name,
    title,
    description: body.description?.trim() ?? '',
    purpose: body.purpose?.trim() ?? '',
    promptTemplate: normalizeOptionalText(body.promptTemplate),
    systemPrompt: normalizeOptionalText(body.systemPrompt),
    allowedTools: sanitizeAgentTaskAllowedTools(body.allowedTools),
    model: body.model?.trim() || 'sonnet',
    effort: body.effort ?? 'high',
    permissionMode: body.permissionMode ?? 'plan',
    listed: body.listed ?? false,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateAgentTask(
  ctx: AppContext,
  id: string,
  body: UpdateAgentTaskRequest,
): AgentTask {
  const current = getAgentTask(ctx, id);
  let name = current.name;
  if (body.name != null && !current.builtIn) {
    const next = body.name.trim().toLowerCase();
    if (!isValidAgentTaskName(next)) {
      throw new Error('Task name must be a lowercase slug (a-z, 0-9, hyphens)');
    }
    const conflict = ctx.repos.agentTasks.getByName(next);
    if (conflict && conflict.id !== id) {
      throw new Error(`A task named "${next}" already exists`);
    }
    name = next;
  }

  const title = body.title != null ? body.title.trim() : current.title;
  if (!title) throw new Error('Title is required');

  return ctx.repos.agentTasks.update({
    ...current,
    name,
    title,
    description: body.description != null ? body.description.trim() : current.description,
    purpose: body.purpose != null ? body.purpose.trim() : current.purpose,
    promptTemplate:
      body.promptTemplate !== undefined
        ? normalizeOptionalText(body.promptTemplate)
        : current.promptTemplate,
    systemPrompt:
      body.systemPrompt !== undefined
        ? normalizeOptionalText(body.systemPrompt)
        : current.systemPrompt,
    allowedTools:
      body.allowedTools !== undefined
        ? sanitizeAgentTaskAllowedTools(body.allowedTools)
        : current.allowedTools,
    model: body.model?.trim() || current.model,
    effort: body.effort ?? current.effort,
    permissionMode: body.permissionMode ?? current.permissionMode,
    listed: body.listed ?? current.listed,
    updatedAt: nowIso(),
  });
}

export function deleteAgentTask(ctx: AppContext, id: string): void {
  const task = getAgentTask(ctx, id);
  if (task.builtIn) {
    throw new Error(`Built-in task "${task.name}" cannot be deleted`);
  }
  ctx.repos.agentTasks.delete(id);
}
