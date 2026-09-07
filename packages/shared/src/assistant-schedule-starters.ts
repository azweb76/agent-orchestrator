import type {
  AssistantSchedulePlaybook,
  AssistantScheduleStatus,
} from './assistant-schedules.js';
import {
  CI_SWEEP_CRON,
  MORNING_BRIEFING_CRON,
  REVIEW_SWEEP_CRON,
} from './assistant-schedules.js';

/** Minimal schedule row for Command UI (matches list_schedules JSON). */
export type AssistantScheduleListItem = {
  id: string;
  name: string;
  kind: 'cron' | 'once';
  playbook: AssistantSchedulePlaybook;
  status: AssistantScheduleStatus;
  policy: string;
  cron: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export type AssistantScheduleStarter = {
  id: string;
  label: string;
  prompt: string;
};

function hasActivePlaybook(
  schedules: AssistantScheduleListItem[],
  playbook: AssistantSchedulePlaybook,
): boolean {
  return schedules.some((s) => s.playbook === playbook && s.status === 'active');
}

function enablePlaybookStarter(
  playbook: Exclude<AssistantSchedulePlaybook, 'prompt'>,
): AssistantScheduleStarter {
  if (playbook === 'morning_fleet_briefing') {
    return {
      id: 'enable-morning',
      label: 'Enable morning briefing',
      prompt: `Create an Assistant schedule named "Morning fleet briefing" with playbook morning_fleet_briefing, cron "${MORNING_BRIEFING_CRON}", policy propose_in_chat, timezone UTC, and confirm=true.`,
    };
  }
  if (playbook === 'ci_sweep') {
    return {
      id: 'enable-ci-sweep',
      label: 'Enable CI sweep',
      prompt: `Create an Assistant schedule named "CI sweep" with playbook ci_sweep, cron "${CI_SWEEP_CRON}", policy auto_write_templates, timezone UTC, and confirm=true.`,
    };
  }
  return {
    id: 'enable-review-sweep',
    label: 'Enable review sweep',
    prompt: `Create an Assistant schedule named "Review sweep" with playbook review_sweep, cron "${REVIEW_SWEEP_CRON}", policy auto_write_templates, timezone UTC, and confirm=true.`,
  };
}

/**
 * Build Assistant-first schedule action chips from the live schedule list.
 * Prefers enabling missing playbooks; adds pause/resume for existing rows.
 */
export function buildScheduleStarters(input: {
  schedules: AssistantScheduleListItem[];
  max?: number;
}): AssistantScheduleStarter[] {
  const max = input.max ?? 3;
  const starters: AssistantScheduleStarter[] = [];
  const schedules = input.schedules;

  const playbooks = [
    'morning_fleet_briefing',
    'ci_sweep',
    'review_sweep',
  ] as const;
  for (const playbook of playbooks) {
    if (starters.length >= max) break;
    if (!hasActivePlaybook(schedules, playbook)) {
      starters.push(enablePlaybookStarter(playbook));
    }
  }

  for (const schedule of schedules) {
    if (starters.length >= max) break;
    if (schedule.status === 'completed') continue;
    if (schedule.status === 'active') {
      starters.push({
        id: `pause:${schedule.id}`,
        label: `Pause ${schedule.name}`,
        prompt: `Pause Assistant schedule ${schedule.id} (${schedule.name}) with confirm=true.`,
      });
    } else if (schedule.status === 'paused') {
      starters.push({
        id: `resume:${schedule.id}`,
        label: `Resume ${schedule.name}`,
        prompt: `Resume Assistant schedule ${schedule.id} (${schedule.name}) by calling pause_schedule with paused=false and confirm=true.`,
      });
    }
  }

  if (starters.length === 0) {
    starters.push({
      id: 'list-schedules',
      label: 'List schedules',
      prompt: 'List my Assistant schedules and recent runs.',
    });
  }

  return starters.slice(0, max);
}
