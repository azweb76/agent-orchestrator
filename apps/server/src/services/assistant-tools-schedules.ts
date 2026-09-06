import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  MORNING_BRIEFING_CRON,
  nextCronOccurrence,
  parseCron,
  resolveOnceRunAt,
  resolveSchedulePrompt,
  type AssistantSchedule,
  type AssistantScheduleKind,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { nowIso } from './app-context.js';
import type { AssistantToolExecution } from './assistant-tools.js';

const policySchema = z.enum(['notify_only', 'propose_in_chat', 'auto_write_templates']);
const playbookSchema = z.enum(['prompt', 'morning_fleet_briefing']);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  kind: z.enum(['cron', 'once']).optional(),
  cron: z.string().max(120).optional(),
  runIn: z.string().max(80).optional(),
  runAt: z.string().max(80).optional(),
  timezone: z.string().min(1).max(80).optional(),
  policy: policySchema,
  playbook: playbookSchema,
  prompt: z.string().max(8000).optional(),
  confirm: z.boolean(),
});

const onceSchema = z.object({
  prompt: z.string().min(1).max(8000),
  runIn: z.string().max(80).optional(),
  runAt: z.string().max(80).optional(),
  name: z.string().min(1).max(120).optional(),
  policy: policySchema.optional(),
  timezone: z.string().min(1).max(80).optional(),
  confirm: z.boolean(),
});

function computeNextCronRunAt(cron: string, timezone: string, after = new Date()): string | null {
  const next = nextCronOccurrence(cron, after, timezone);
  return next ? next.toISOString() : null;
}

function assertTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

function serializeSchedule(schedule: AssistantSchedule) {
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description,
    kind: schedule.kind,
    cron: schedule.cron || null,
    timezone: schedule.timezone,
    policy: schedule.policy,
    playbook: schedule.playbook,
    prompt: schedule.prompt,
    status: schedule.status,
    nextRunAt: schedule.nextRunAt,
    lastRunAt: schedule.lastRunAt,
  };
}

function persistSchedule(ctx: AppContext, schedule: AssistantSchedule): AssistantToolExecution {
  ctx.repos.assistantSchedules.create(schedule);
  return {
    content: JSON.stringify({
      ok: true,
      schedule: serializeSchedule(schedule),
    }),
  };
}

export function handleListSchedules(
  ctx: AppContext,
  input: Record<string, unknown>,
): AssistantToolExecution {
  const includePaused = input.includePaused !== false;
  const includeCompleted = input.includeCompleted === true;
  const schedules = ctx.repos.assistantSchedules.list({ includePaused, includeCompleted });
  return {
    content: JSON.stringify(schedules.map(serializeSchedule)),
  };
}

export function handleCreateSchedule(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: (confirm: boolean | undefined, toolName: string) => void,
): AssistantToolExecution {
  const body = createSchema.parse(input);
  requireConfirm(body.confirm, 'create_schedule');

  const kind: AssistantScheduleKind = body.kind ?? 'cron';
  const playbook = body.playbook as AssistantSchedule['playbook'];
  const prompt = playbook === 'prompt' ? body.prompt?.trim() || null : null;
  if (playbook === 'prompt' && !prompt) {
    throw new Error('playbook=prompt requires a non-empty prompt');
  }

  const timezone = body.timezone?.trim() || 'UTC';
  assertTimezone(timezone);

  let cron = '';
  let nextRunAt: string | null = null;
  if (kind === 'cron') {
    const expression = body.cron?.trim();
    if (!expression) throw new Error('kind=cron requires cron');
    parseCron(expression);
    cron = expression;
    nextRunAt = computeNextCronRunAt(cron, timezone, new Date(Date.now() + 60_000));
  } else {
    nextRunAt = resolveOnceRunAt({
      runIn: body.runIn,
      runAt: body.runAt,
    }).toISOString();
  }

  resolveSchedulePrompt({ playbook, prompt, kind });

  const createdAt = nowIso();
  return persistSchedule(ctx, {
    id: uuidv4(),
    name: body.name.trim(),
    description: (body.description ?? '').trim(),
    kind,
    cron,
    timezone,
    policy: body.policy,
    playbook,
    prompt,
    status: 'active',
    nextRunAt,
    lastRunAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function handleScheduleOnce(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: (confirm: boolean | undefined, toolName: string) => void,
): AssistantToolExecution {
  const body = onceSchema.parse(input);
  requireConfirm(body.confirm, 'schedule_once');

  const prompt = body.prompt.trim();
  const timezone = body.timezone?.trim() || 'UTC';
  assertTimezone(timezone);
  const nextRunAt = resolveOnceRunAt({
    runIn: body.runIn,
    runAt: body.runAt,
  }).toISOString();

  const name =
    body.name?.trim() ||
    (prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt) ||
    'One-time task';

  const createdAt = nowIso();
  const schedule: AssistantSchedule = {
    id: uuidv4(),
    name,
    description: 'One-time Assistant task',
    kind: 'once',
    cron: '',
    timezone,
    policy: body.policy ?? 'notify_only',
    playbook: 'prompt',
    prompt,
    status: 'active',
    nextRunAt,
    lastRunAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  resolveSchedulePrompt(schedule);
  return persistSchedule(ctx, schedule);
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
  if (existing.status === 'completed') {
    throw new Error('Completed one-shot schedules cannot be paused or resumed');
  }

  let nextRunAt = existing.nextRunAt;
  if (paused) {
    if (existing.kind === 'cron') nextRunAt = null;
  } else if (existing.kind === 'cron') {
    nextRunAt = computeNextCronRunAt(
      existing.cron,
      existing.timezone,
      new Date(Date.now() + 60_000),
    );
  } else if (!nextRunAt) {
    throw new Error('Cannot resume one-shot schedule without a stored nextRunAt');
  }

  const updated: AssistantSchedule = {
    ...existing,
    status: paused ? 'paused' : 'active',
    nextRunAt,
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
    kind: 'cron',
    cron: MORNING_BRIEFING_CRON,
    timezone,
    policy: 'propose_in_chat',
    playbook: 'morning_fleet_briefing',
    confirm: true,
  };
}

export { computeNextCronRunAt };
