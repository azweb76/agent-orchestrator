/** Assistant schedule + run types (cron / one-shot playbooks with policy tiers). */

export type AssistantSchedulePolicy =
  | 'notify_only'
  | 'propose_in_chat'
  | 'auto_write_templates';

export type AssistantScheduleStatus = 'active' | 'paused' | 'completed';

export type AssistantScheduleKind = 'cron' | 'once';

export type AssistantSchedulePlaybook = 'prompt' | 'morning_fleet_briefing';

export type AssistantRunStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

export interface AssistantSchedule {
  id: string;
  name: string;
  description: string;
  /** cron | once — once runs a single time then completes */
  kind: AssistantScheduleKind;
  /** 5-field cron for kind=cron; empty string for kind=once */
  cron: string;
  /** IANA timezone (e.g. UTC, America/Phoenix) */
  timezone: string;
  policy: AssistantSchedulePolicy;
  playbook: AssistantSchedulePlaybook;
  /** Used when playbook is `prompt`; ignored for built-in playbooks. */
  prompt: string | null;
  status: AssistantScheduleStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantRun {
  id: string;
  scheduleId: string;
  status: AssistantRunStatus;
  policy: AssistantSchedulePolicy;
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
  error: string | null;
  /** JSON array of { name, input, isError? } for audit. */
  toolCallsJson: string;
}

export const ASSISTANT_SCHEDULE_POLICIES: AssistantSchedulePolicy[] = [
  'notify_only',
  'propose_in_chat',
  'auto_write_templates',
];

export const ASSISTANT_SCHEDULE_KINDS: AssistantScheduleKind[] = ['cron', 'once'];

export const ASSISTANT_SCHEDULE_PLAYBOOKS: AssistantSchedulePlaybook[] = [
  'prompt',
  'morning_fleet_briefing',
];

/** Default weekday 9:00 local cron for morning fleet briefing. */
export const MORNING_BRIEFING_CRON = '0 9 * * 1-5';

export const MORNING_BRIEFING_PROMPT = `You are running a scheduled morning fleet briefing.

1. Call get_work_queue (limit 12) and list_agents.
2. Call get_status.
3. Summarize: blocked agents (pending permissions), failing CI, review requests, open issues, and overall fleet health.
4. If spend/usage context appears in tool results, include today's spend briefly.
5. End with the top 3 recommended next actions (do not execute writes unless schedule policy allows and user already confirmed via auto_write_templates).

Keep the reply concise and scannable for a human reading the Assistant thread.`;

const ONCE_PROMPT_WRAPPER = `You are executing a one-time scheduled task in the Assistant thread.
Do exactly what the user requested below. Prefer a direct reply with no tools unless the request requires fleet inspection or action.

User request:
`;

export function resolveSchedulePrompt(
  schedule: Pick<AssistantSchedule, 'playbook' | 'prompt' | 'kind'>,
): string {
  if (schedule.playbook === 'morning_fleet_briefing') {
    return MORNING_BRIEFING_PROMPT;
  }
  const custom = schedule.prompt?.trim();
  if (!custom) {
    throw new Error('prompt playbook requires a non-empty prompt');
  }
  if (schedule.kind === 'once') {
    return `${ONCE_PROMPT_WRAPPER}${custom}`;
  }
  return custom;
}

/** Write tools auto-confirmable under auto_write_templates policy. */
export const AUTO_WRITE_TEMPLATE_TOOLS = new Set([
  'start_agent_session',
  'create_agent_from_github_issue',
  'send_agent_message',
  'respond_permission',
  'dismiss_work_item',
]);

export function schedulePolicyAllowsWrite(
  policy: AssistantSchedulePolicy | undefined,
  toolName: string,
  risk: 'read' | 'write',
): { allow: boolean; autoConfirm: boolean; reason?: string } {
  if (risk !== 'write') return { allow: true, autoConfirm: false };
  if (!policy) return { allow: true, autoConfirm: false };
  if (policy === 'notify_only' || policy === 'propose_in_chat') {
    return {
      allow: false,
      autoConfirm: false,
      reason: `Schedule policy ${policy} blocks write tool ${toolName}`,
    };
  }
  if (policy === 'auto_write_templates') {
    if (AUTO_WRITE_TEMPLATE_TOOLS.has(toolName)) {
      return { allow: true, autoConfirm: true };
    }
    return {
      allow: false,
      autoConfirm: false,
      reason: `Schedule policy auto_write_templates does not allow ${toolName}`,
    };
  }
  return { allow: true, autoConfirm: false };
}
