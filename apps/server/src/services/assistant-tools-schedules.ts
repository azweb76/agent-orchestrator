import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  MORNING_BRIEFING_CRON,
  nextCronOccurrence,
  parseCron,
  resolveSchedulePrompt,
  type AssistantSchedule,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { nowIso } from './app-context.js';
import type { AssistantToolExecution } from './assistant-tools.js';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  cron: z.string().min(1).max(120),
  timezone: z.string().min(1).max(80).optional(),
  policy: z.enum(['notify_only', 'propose_in_chat', 'auto_write_templates']),
  playbook: z.enum(['prompt', 'morning_fleet_briefing']),
  prompt: z.string().max(8000).optional(),
  confirm: z.boolean(),
});

function computeNextRunAt(cron: string, timezone: string, after = new Date()): string | null {
  const next = nextCronOccurrence(cron, after, timezone);
  return next ? next.toISOString() : null;
}

export function handleListSchedules(
  ctx: AppContext,
  input: Record<string, unknown>,
): AssistantToolExecution {
  const includePaused = input.includePaused !== false;
  const schedules = ctx.repos.assistantSchedules.list(includePaused);
  return {
    content: JSON.stringify(
      schedules.map((schedule) => ({
        id: schedule.id,
        name: schedule.name,
        description: schedule.description,
        cron: schedule.cron,
        timezone: schedule.timezone,
        policy: schedule.policy,
        playbook: schedule.playbook,
        status: schedule.status,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: schedule.lastRunAt,
      })),
    ),
  };
}

export function handleCreateSchedule(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: (confirm: boolean | undefined, toolName: string) => void,
): AssistantToolExecution {
  const body = createSchema.parse(input);
  requireConfirm(body.confirm, 'create_schedule');
  parseCron(body.cron);

  const playbook = body.playbook as AssistantSchedule['playbook'];
  const prompt =
    playbook === 'prompt'
      ? (body.prompt?.trim() || null)
      : null;
  if (playbook === 'prompt' && !prompt) {
    throw new Error('playbook=prompt requires a non-empty prompt');
  }
  // Validate built-in playbook resolves
  resolveSchedulePrompt({ playbook, prompt });

  const timezone = body.timezone?.trim() || 'UTC';
  // Validate timezone early
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  const createdAt = nowIso();
  const schedule: AssistantSchedule = {
    id: uuidv4(),
    name: body.name.trim(),
    description: (body.description ?? '').trim(),
    cron: body.cron.trim(),
    timezone,
    policy: body.policy as AssistantSchedule['policy'],
    playbook,
    prompt,
    status: 'active',
    nextRunAt: computeNextRunAt(body.cron.trim(), timezone, new Date(Date.now() + 60_000)),
    lastRunAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  ctx.repos.assistantSchedules.create(schedule);
  return {
    content: JSON.stringify({
      ok: true,
      schedule: {
        id: schedule.id,
        name: schedule.name,
        cron: schedule.cron,
        timezone: schedule.timezone,
        policy: schedule.policy,
        playbook: schedule.playbook,
        nextRunAt: schedule.nextRunAt,
        status: schedule.status,
      },
    }),
  };
}

export function handlePauseSchedule(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: (confirm: boolean | undefined, toolName: string) => void,
): AssistantToolExecution {
  const scheduleId = z.string().min(1).parse(input.scheduleId);
  requireConfirm(input.confirm === true, 'pause_schedule');
  const paused = input.paused !== false;
  const existing = ctx.repos.assistantSchedules.getById(scheduleId);
  if (!existing) throw new Error(`Schedule not found: ${scheduleId}`);

  const updated: AssistantSchedule = {
    ...existing,
    status: paused ? 'paused' : 'active',
    nextRunAt: paused
      ? null
      : computeNextRunAt(existing.cron, existing.timezone, new Date(Date.now() + 60_000)),
    updatedAt: nowIso(),
  };
  ctx.repos.assistantSchedules.update(updated);
  return {
    content: JSON.stringify({
      ok: true,
      scheduleId,
      status: updated.status,
      nextRunAt: updated.nextRunAt,
    }),
  };
}

export function handleDeleteSchedule(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: (confirm: boolean | undefined, toolName: string) => void,
): AssistantToolExecution {
  const scheduleId = z.string().min(1).parse(input.scheduleId);
  requireConfirm(input.confirm === true, 'delete_schedule');
  const existing = ctx.repos.assistantSchedules.getById(scheduleId);
  if (!existing) throw new Error(`Schedule not found: ${scheduleId}`);
  ctx.repos.assistantSchedules.delete(scheduleId);
  return { content: JSON.stringify({ ok: true, scheduleId, deleted: true }) };
}

export function handleListScheduleRuns(
  ctx: AppContext,
  input: Record<string, unknown>,
): AssistantToolExecution {
  const scheduleId =
    typeof input.scheduleId === 'string' && input.scheduleId.trim()
      ? input.scheduleId.trim()
      : undefined;
  const limit =
    typeof input.limit === 'number' && Number.isFinite(input.limit)
      ? Math.min(50, Math.max(1, Math.floor(input.limit)))
      : 20;
  const runs = ctx.repos.assistantRuns.list({ scheduleId, limit });
  return {
    content: JSON.stringify(
      runs.map((run) => ({
        id: run.id,
        scheduleId: run.scheduleId,
        status: run.status,
        policy: run.policy,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        summary: run.summary,
        error: run.error,
      })),
    ),
  };
}

export function defaultMorningBriefingInput(timezone = 'UTC'): Record<string, unknown> {
  return {
    name: 'Morning fleet briefing',
    description: 'Weekday morning work-queue + blocked agents summary into Assistant chat',
    cron: MORNING_BRIEFING_CRON,
    timezone,
    policy: 'propose_in_chat',
    playbook: 'morning_fleet_briefing',
    confirm: true,
  };
}

export { computeNextRunAt };
