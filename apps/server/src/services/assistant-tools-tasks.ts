import { z } from 'zod';
import type { AgentTask, UpdateAgentTaskRequest } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import {
  getAgentTask,
  listAgentTasks,
  requireAgentTaskByName,
  updateAgentTask,
} from './agent-tasks.js';

/** Mirrors AssistantToolExecution without importing assistant-tools (avoids cycles). */
type TaskToolResult = {
  content: string;
  isError?: boolean;
};

const permissionMode = z.enum([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
]);

const effort = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

const taskRefSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    task: z.string().min(1).max(63).optional(),
  })
  .refine((value) => Boolean(value.taskId || value.task), {
    message: 'Provide taskId or task (slug)',
  });

const updateAgentTaskSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    task: z.string().min(1).max(63).optional(),
    name: z.string().min(1).max(63).optional(),
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    purpose: z.string().max(4000).optional(),
    promptTemplate: z.string().max(20_000).nullable().optional(),
    systemPrompt: z.string().max(20_000).nullable().optional(),
    allowedTools: z.string().max(8000).nullable().optional(),
    model: z.string().min(1).max(64).optional(),
    effort: effort.optional(),
    permissionMode: permissionMode.optional(),
    listed: z.boolean().optional(),
    confirm: z.boolean(),
  })
  .refine((value) => Boolean(value.taskId || value.task), {
    message: 'Provide taskId or task (slug)',
  });

function resolveAgentTaskRef(
  ctx: AppContext,
  ref: { taskId?: string; task?: string },
): AgentTask {
  if (ref.taskId) return getAgentTask(ctx, ref.taskId);
  if (ref.task) return requireAgentTaskByName(ctx, ref.task);
  throw new Error('Provide taskId or task (slug)');
}

function serializeAgentTask(task: AgentTask) {
  return {
    id: task.id,
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
    updatedAt: task.updatedAt,
  };
}

export function handleListAgentTasks(ctx: AppContext): TaskToolResult {
  const tasks = listAgentTasks(ctx).map((task) => ({
    id: task.id,
    name: task.name,
    title: task.title,
    purpose: task.purpose,
    listed: task.listed,
    builtIn: task.builtIn,
    model: task.model,
    effort: task.effort,
    permissionMode: task.permissionMode,
  }));
  return { content: JSON.stringify(tasks) };
}

export function handleGetAgentTask(
  ctx: AppContext,
  input: Record<string, unknown>,
): TaskToolResult {
  const ref = taskRefSchema.parse(input);
  const task = resolveAgentTaskRef(ctx, ref);
  return { content: JSON.stringify(serializeAgentTask(task)) };
}

export function handleUpdateAgentTask(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: (confirm: boolean | undefined, toolName: string) => void,
): TaskToolResult {
  const body = updateAgentTaskSchema.parse(input);
  requireConfirm(body.confirm, 'update_agent_task');

  const current = resolveAgentTaskRef(ctx, body);
  const patch: UpdateAgentTaskRequest = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.purpose !== undefined) patch.purpose = body.purpose;
  if (body.promptTemplate !== undefined) patch.promptTemplate = body.promptTemplate;
  if (body.systemPrompt !== undefined) patch.systemPrompt = body.systemPrompt;
  if (body.allowedTools !== undefined) patch.allowedTools = body.allowedTools;
  if (body.model !== undefined) patch.model = body.model;
  if (body.effort !== undefined) patch.effort = body.effort;
  if (body.permissionMode !== undefined) patch.permissionMode = body.permissionMode;
  if (body.listed !== undefined) patch.listed = body.listed;

  if (Object.keys(patch).length === 0) {
    throw new Error('No update fields provided');
  }

  const updated = updateAgentTask(ctx, current.id, patch);
  return {
    content: JSON.stringify({ ok: true, task: serializeAgentTask(updated) }),
  };
}
