import { v4 as uuidv4 } from 'uuid';
import {
  nextCronOccurrence,
  resolveSchedulePrompt,
  type AssistantChatResponse,
  type AssistantRun,
  type AssistantSchedule,
  type AssistantSchedulePolicy,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { nowIso } from './app-context.js';
import { runAssistantChat, type AssistantChatOptions } from './assistant-chat.js';
import { getUsageSummary } from './workspaces.js';

export type ScheduleRunnerOptions = {
  tickMs?: number;
  /** Injectable for tests — defaults to runAssistantChat. */
  runChat?: (
    ctx: AppContext,
    content: string,
    options?: AssistantChatOptions,
  ) => Promise<AssistantChatResponse>;
  now?: () => Date;
};

let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
let scheduleRunning = false;

export function stopAssistantScheduleRunner(): void {
  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }
}

function scheduleNext(ctx: AppContext, delayMs: number, options: ScheduleRunnerOptions): void {
  stopAssistantScheduleRunner();
  scheduleTimer = setTimeout(() => {
    void runScheduleCycle(ctx, options);
  }, delayMs);
  scheduleTimer.unref?.();
}

export function startAssistantScheduleRunner(
  ctx: AppContext,
  options: ScheduleRunnerOptions = {},
): void {
  stopAssistantScheduleRunner();
  scheduleNext(ctx, options.tickMs ?? 15_000, options);
}

function advanceSchedule(schedule: AssistantSchedule, after: Date): AssistantSchedule {
  const next = nextCronOccurrence(schedule.cron, new Date(after.getTime() + 60_000), schedule.timezone);
  return {
    ...schedule,
    lastRunAt: after.toISOString(),
    nextRunAt: next ? next.toISOString() : null,
    updatedAt: nowIso(),
  };
}

function summaryFromChat(response: AssistantChatResponse): string {
  const lastAssistant = [...response.messages].reverse().find((m) => m.role === 'assistant');
  const text = lastAssistant?.content?.trim() ?? '';
  if (!text) return 'Schedule run completed with no assistant text.';
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function toolAuditFromChat(response: AssistantChatResponse): string {
  const calls: Array<{ name: string; input: Record<string, unknown>; isError?: boolean }> = [];
  for (const msg of response.messages) {
    if (msg.role === 'assistant') {
      for (const call of msg.toolCalls ?? []) {
        calls.push({ name: call.name, input: call.input });
      }
    }
    if (msg.role === 'tool' && msg.toolResult?.isError) {
      const matching = [...calls].reverse().find((c) => c.name === msg.toolResult!.toolName);
      if (matching) matching.isError = true;
    }
  }
  return JSON.stringify(calls);
}

export function buildScheduleUserPrompt(ctx: AppContext, schedule: AssistantSchedule): string {
  const policyPrefix =
    schedule.policy === 'auto_write_templates'
      ? '[Scheduled run — policy auto_write_templates: you may confirm template write tools.]'
      : `[Scheduled run — policy ${schedule.policy}: do not call write tools; summarize and propose only.]`;

  let body = resolveSchedulePrompt(schedule);
  if (schedule.playbook === 'morning_fleet_briefing') {
    const usage = getUsageSummary(ctx);
    body = `${body}

Spend snapshot (from usage rollup):
- todayCostUsd: ${usage.todayCostUsd}
- totalCostUsd: ${usage.totalCostUsd}
- totalAssistantTurns: ${usage.totalAssistantTurns}
- topAgents: ${
      usage.agents
        .slice(0, 5)
        .map((a) => `${a.agentName}=$${a.costUsd}`)
        .join(', ') || 'none'
    }`;
  }
  return `${policyPrefix}\n\n${body}`;
}

export async function executeScheduleRun(
  ctx: AppContext,
  schedule: AssistantSchedule,
  options: ScheduleRunnerOptions = {},
): Promise<AssistantRun> {
  const startedAt = nowIso();
  const run: AssistantRun = {
    id: uuidv4(),
    scheduleId: schedule.id,
    status: 'running',
    policy: schedule.policy,
    startedAt,
    finishedAt: null,
    summary: null,
    error: null,
    toolCallsJson: '[]',
  };
  ctx.repos.assistantRuns.create(run);

  const runChat = options.runChat ?? runAssistantChat;

  try {
    const prompt = buildScheduleUserPrompt(ctx, schedule);
    const response = await runChat(ctx, prompt, {
      schedulePolicy: schedule.policy,
      source: 'schedule',
    });    const finishedAt = nowIso();
    const completed: AssistantRun = {
      ...run,
      status: 'succeeded',
      finishedAt,
      summary: summaryFromChat(response),
      toolCallsJson: toolAuditFromChat(response),
    };
    ctx.repos.assistantRuns.update(completed);
    ctx.repos.assistantSchedules.update(advanceSchedule(schedule, new Date(finishedAt)));
    return completed;
  } catch (error) {
    const finishedAt = nowIso();
    const failed: AssistantRun = {
      ...run,
      status: 'failed',
      finishedAt,
      error: error instanceof Error ? error.message : String(error),
      summary: null,
      toolCallsJson: '[]',
    };
    ctx.repos.assistantRuns.update(failed);
    ctx.repos.assistantSchedules.update(advanceSchedule(schedule, new Date(finishedAt)));
    return failed;
  }
}

export async function runScheduleCycle(
  ctx: AppContext,
  options: ScheduleRunnerOptions = {},
): Promise<{ ran: number }> {
  if (scheduleRunning) {
    scheduleNext(ctx, 2_000, options);
    return { ran: 0 };
  }

  scheduleRunning = true;
  let ran = 0;
  try {
    const now = options.now?.() ?? new Date();
    const due = ctx.repos.assistantSchedules.listDue(now.toISOString());
    for (const schedule of due) {
      try {
        await executeScheduleRun(ctx, schedule, options);
        ran += 1;
      } catch (error) {
        console.warn('[assistant-schedules] run failed:', schedule.id, error);
      }
    }
  } finally {
    scheduleRunning = false;
  }

  scheduleNext(ctx, options.tickMs ?? 30_000, options);
  return { ran };
}

/** Test hook: run due schedules once without arming the timer. */
export async function runAssistantSchedulesOnce(
  ctx: AppContext,
  options: ScheduleRunnerOptions = {},
): Promise<{ ran: number }> {
  const now = options.now?.() ?? new Date();
  const due = ctx.repos.assistantSchedules.listDue(now.toISOString());
  let ran = 0;
  for (const schedule of due) {
    await executeScheduleRun(ctx, schedule, options);
    ran += 1;
  }
  return { ran };
}

export function schedulePolicyLabel(policy: AssistantSchedulePolicy): string {
  return policy;
}
