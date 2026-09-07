import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ASSISTANT_TOOLS, CI_SWEEP_CRON, MORNING_BRIEFING_CRON, REVIEW_SWEEP_CRON } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';
import { executeAssistantTool } from './assistant-tools.js';
import { runAssistantSchedulesOnce } from './assistant-schedule-runner.js';
import {
  defaultCiSweepInput,
  defaultMorningBriefingInput,
  defaultReviewSweepInput,
} from './assistant-tools-schedules.js';

function makeCtx(tmp: string): AppContext {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  return {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    jira: new JiraService({}),
    claude: new ClaudeService('claude', path.join(tmp, 'runs')),
    anthropic: new AnthropicService(),
    dataDir: tmp,
  };
}

test('ASSISTANT_TOOLS includes schedule CRUD tools', () => {
  const names = ASSISTANT_TOOLS.map((tool) => tool.name);
  for (const name of [
    'list_schedules',
    'create_schedule',
    'pause_schedule',
    'delete_schedule',
    'schedule_once',
    'schedule_once',
    'list_schedule_runs',
  ]) {
    assert.ok(names.includes(name), name);
  }
});

test('create_schedule refuses without confirm and persists morning briefing', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sched-'));
  const ctx = makeCtx(tmp);

  const denied = await executeAssistantTool(ctx, 'create_schedule', {
    ...defaultMorningBriefingInput('UTC'),
    confirm: false,
  });
  assert.equal(denied.isError, true);
  assert.match(denied.content, /confirm=true/);

  const created = await executeAssistantTool(ctx, 'create_schedule', defaultMorningBriefingInput('UTC'));
  assert.equal(created.isError, undefined);
  const body = JSON.parse(created.content) as {
    ok: boolean;
    schedule: { id: string; cron: string; playbook: string; policy: string; nextRunAt: string | null };
  };
  assert.equal(body.ok, true);
  assert.equal(body.schedule.cron, MORNING_BRIEFING_CRON);
  assert.equal(body.schedule.playbook, 'morning_fleet_briefing');
  assert.equal(body.schedule.policy, 'propose_in_chat');
  assert.ok(body.schedule.nextRunAt);

  const listed = await executeAssistantTool(ctx, 'list_schedules', {});
  const schedules = JSON.parse(listed.content) as Array<{ id: string; name: string }>;
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0]?.id, body.schedule.id);
});

test('pause and delete schedule + list runs audit', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sched-'));
  const ctx = makeCtx(tmp);
  const created = await executeAssistantTool(ctx, 'create_schedule', {
    name: 'Custom ping',
    cron: '*/5 * * * *',
    policy: 'notify_only',
    playbook: 'prompt',
    prompt: 'Say hello from the schedule runner.',
    confirm: true,
  });
  const { schedule } = JSON.parse(created.content) as { schedule: { id: string } };

  const paused = await executeAssistantTool(ctx, 'pause_schedule', {
    scheduleId: schedule.id,
    paused: true,
    confirm: true,
  });
  assert.equal(paused.isError, undefined);
  assert.equal(JSON.parse(paused.content).status, 'paused');

  const resumed = await executeAssistantTool(ctx, 'pause_schedule', {
    scheduleId: schedule.id,
    paused: false,
    confirm: true,
  });
  assert.equal(JSON.parse(resumed.content).status, 'active');

  const deleted = await executeAssistantTool(ctx, 'delete_schedule', {
    scheduleId: schedule.id,
    confirm: true,
  });
  assert.equal(JSON.parse(deleted.content).deleted, true);
  assert.equal(ctx.repos.assistantSchedules.list().length, 0);
});

test('schedule runner posts into assistant thread and audits runs', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sched-'));
  const ctx = makeCtx(tmp);
  const created = await executeAssistantTool(ctx, 'create_schedule', defaultMorningBriefingInput('UTC'));
  const { schedule } = JSON.parse(created.content) as {
    schedule: { id: string };
  };

  // Force due now
  const row = ctx.repos.assistantSchedules.getById(schedule.id)!;
  ctx.repos.assistantSchedules.update({
    ...row,
    nextRunAt: new Date(Date.now() - 60_000).toISOString(),
  });

  const result = await runAssistantSchedulesOnce(ctx, {
    runChat: async (chatCtx, content) => {
      assert.match(content, /Spend snapshot/);
      assert.match(content, /todayCostUsd/);
      const msg = {
        id: 'a1',
        role: 'assistant' as const,
        content: `Briefing stub: ${content.slice(0, 40)}`,
        createdAt: new Date().toISOString(),
      };
      chatCtx.repos.assistantMessages.create({
        id: 'u1',
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      });
      chatCtx.repos.assistantMessages.create(msg);
      return { messages: [msg] };
    },
  });
  assert.equal(result.ran, 1);

  const runs = ctx.repos.assistantRuns.list({ scheduleId: schedule.id });
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.status, 'succeeded');
  assert.match(runs[0]?.summary ?? '', /Briefing stub/);

  const thread = ctx.repos.assistantMessages.list();
  assert.ok(thread.some((m) => m.role === 'assistant' && m.content.includes('Briefing stub')));

  const listedRuns = await executeAssistantTool(ctx, 'list_schedule_runs', {
    scheduleId: schedule.id,
  });
  const runRows = JSON.parse(listedRuns.content) as Array<{ status: string }>;
  assert.equal(runRows[0]?.status, 'succeeded');
});

test('notify_only schedule policy blocks write tools', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sched-'));
  const ctx = makeCtx(tmp);
  const blocked = await executeAssistantTool(
    ctx,
    'dismiss_work_item',
    { workItemId: 'x', confirm: true },
    { schedulePolicy: 'notify_only' },
  );
  assert.equal(blocked.isError, true);
  assert.match(blocked.content, /notify_only/);
});

test('cron helpers match weekday morning briefing', async () => {
  const { cronMatches, nextCronOccurrence, resolveSchedulePrompt, schedulePolicyAllowsWrite } =
    await import('@agent-orchestrator/shared');
  const mondayNineUtc = new Date('2026-09-07T09:00:00.000Z');
  assert.equal(cronMatches(MORNING_BRIEFING_CRON, mondayNineUtc, 'UTC'), true);
  const fridayAfternoon = new Date('2026-09-04T15:00:00.000Z');
  const next = nextCronOccurrence(MORNING_BRIEFING_CRON, fridayAfternoon, 'UTC');
  assert.equal(next?.toISOString(), '2026-09-07T09:00:00.000Z');
  assert.match(
    resolveSchedulePrompt({ kind: 'cron', playbook: 'morning_fleet_briefing', prompt: null }),
    /morning/i,
  );
  assert.equal(
    schedulePolicyAllowsWrite('auto_write_templates', 'start_agent_session', 'write').autoConfirm,
    true,
  );
});

test('create_schedule persists ci_sweep and review_sweep playbooks', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sched-sweep-'));
  const ctx = makeCtx(tmp);

  const ci = await executeAssistantTool(ctx, 'create_schedule', defaultCiSweepInput('UTC'));
  assert.equal(ci.isError, undefined);
  const ciBody = JSON.parse(ci.content) as {
    schedule: { playbook: string; cron: string; policy: string };
  };
  assert.equal(ciBody.schedule.playbook, 'ci_sweep');
  assert.equal(ciBody.schedule.cron, CI_SWEEP_CRON);
  assert.equal(ciBody.schedule.policy, 'auto_write_templates');

  const review = await executeAssistantTool(ctx, 'create_schedule', defaultReviewSweepInput('UTC'));
  assert.equal(review.isError, undefined);
  const reviewBody = JSON.parse(review.content) as {
    schedule: { playbook: string; cron: string };
  };
  assert.equal(reviewBody.schedule.playbook, 'review_sweep');
  assert.equal(reviewBody.schedule.cron, REVIEW_SWEEP_CRON);

  const { resolveSchedulePrompt } = await import('@agent-orchestrator/shared');
  assert.match(
    resolveSchedulePrompt({ kind: 'cron', playbook: 'ci_sweep', prompt: null }),
    /CI sweep/i,
  );
  assert.match(
    resolveSchedulePrompt({ kind: 'cron', playbook: 'review_sweep', prompt: null }),
    /review sweep/i,
  );
});

test('ci_sweep schedule runner uses CI sweep prompt', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sched-ci-run-'));
  const ctx = makeCtx(tmp);
  const created = await executeAssistantTool(ctx, 'create_schedule', defaultCiSweepInput('UTC'));
  const { schedule } = JSON.parse(created.content) as { schedule: { id: string } };
  const row = ctx.repos.assistantSchedules.getById(schedule.id)!;
  ctx.repos.assistantSchedules.update({
    ...row,
    nextRunAt: new Date(Date.now() - 60_000).toISOString(),
  });

  let sawPrompt = false;
  const result = await runAssistantSchedulesOnce(ctx, {
    runChat: async (chatCtx, content) => {
      sawPrompt = /CI sweep/i.test(content) && /fix-ci/i.test(content);
      const msg = {
        id: 'ci-a1',
        role: 'assistant' as const,
        content: 'CI sweep stub: no failing PRs',
        createdAt: new Date().toISOString(),
      };
      chatCtx.repos.assistantMessages.create({
        id: 'ci-u1',
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      });
      chatCtx.repos.assistantMessages.create(msg);
      return { messages: [msg] };
    },
  });
  assert.equal(result.ran, 1);
  assert.equal(sawPrompt, true);
});


test('schedule_once creates a one-shot runIn task and completes after runner', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sched-once-'));
  const ctx = makeCtx(tmp);

  const denied = await executeAssistantTool(ctx, 'schedule_once', {
    prompt: 'Say hi.',
    runIn: '5m',
    confirm: false,
  });
  assert.equal(denied.isError, true);

  const created = await executeAssistantTool(ctx, 'schedule_once', {
    prompt: 'Say hi.',
    runIn: '5m',
    confirm: true,
  });
  assert.equal(created.isError, undefined);
  const body = JSON.parse(created.content) as {
    ok: boolean;
    schedule: { id: string; kind: string; nextRunAt: string; status: string; prompt: string | null };
  };
  assert.equal(body.ok, true);
  assert.equal(body.schedule.kind, 'once');
  assert.equal(body.schedule.status, 'active');
  assert.equal(body.schedule.prompt, 'Say hi.');
  const next = Date.parse(body.schedule.nextRunAt);
  assert.ok(Number.isFinite(next));
  const deltaMs = next - Date.now();
  assert.ok(deltaMs > 4 * 60_000 && deltaMs < 6 * 60_000, `expected ~5m, got ${deltaMs}ms`);

  // Force due and run
  const row = ctx.repos.assistantSchedules.getById(body.schedule.id)!;
  ctx.repos.assistantSchedules.update({
    ...row,
    nextRunAt: new Date(Date.now() - 1_000).toISOString(),
  });

  const result = await runAssistantSchedulesOnce(ctx, {
    runChat: async (chatCtx, content) => {
      assert.match(content, /Say hi/);
      const msg = {
        id: 'once-a1',
        role: 'assistant' as const,
        content: 'Hi!',
        createdAt: new Date().toISOString(),
      };
      chatCtx.repos.assistantMessages.create({
        id: 'once-u1',
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      });
      chatCtx.repos.assistantMessages.create(msg);
      return { messages: [msg] };
    },
  });
  assert.equal(result.ran, 1);

  const completed = ctx.repos.assistantSchedules.getById(body.schedule.id)!;
  assert.equal(completed.status, 'completed');
  assert.equal(completed.nextRunAt, null);

  const runs = ctx.repos.assistantRuns.list({ scheduleId: body.schedule.id });
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.status, 'succeeded');
  assert.match(runs[0]?.summary ?? '', /Hi!/);
});

test('parseDurationToMs and resolveOnceRunAt support 5m', async () => {
  const { parseDurationToMs, resolveOnceRunAt } = await import('@agent-orchestrator/shared');
  assert.equal(parseDurationToMs('5m'), 5 * 60_000);
  assert.equal(parseDurationToMs('1h30m'), 90 * 60_000);
  const now = new Date('2026-09-06T12:00:00.000Z');
  const at = resolveOnceRunAt({ runIn: '5m', now });
  assert.equal(at.toISOString(), '2026-09-06T12:05:00.000Z');
});

test('getAssistantSchedules returns parsed list for HTTP', async () => {
  const { getAssistantSchedules } = await import('./assistant-tools.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-sched-http-'));
  const ctx = makeCtx(tmp);
  const empty = getAssistantSchedules(ctx);
  assert.deepEqual(empty.schedules, []);

  await executeAssistantTool(ctx, 'create_schedule', {
    ...defaultMorningBriefingInput('UTC'),
    confirm: true,
  });
  const listed = getAssistantSchedules(ctx, { includePaused: true });
  assert.equal(listed.schedules.length, 1);
  assert.equal((listed.schedules[0] as { playbook: string }).playbook, 'morning_fleet_briefing');
});
