/** Assistant schedule + run types (cron / one-shot playbooks with policy tiers). */

export type AssistantSchedulePolicy =
  | 'notify_only'
  | 'propose_in_chat'
  | 'auto_write_templates';

export type AssistantScheduleStatus = 'active' | 'paused' | 'completed';

export type AssistantScheduleKind = 'cron' | 'once';

export type AssistantSchedulePlaybook =
  | 'prompt'
  | 'morning_fleet_briefing'
  | 'ci_sweep'
  | 'review_sweep';

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
  'ci_sweep',
  'review_sweep',
];

/** Default weekday 9:00 local cron for morning fleet briefing. */
export const MORNING_BRIEFING_CRON = '0 9 * * 1-5';

/** Default every-30-min weekday cron for CI / review sweeps (business hours UTC-ish). */
export const CI_SWEEP_CRON = '*/30 8-18 * * 1-5';
export const REVIEW_SWEEP_CRON = '*/30 8-18 * * 1-5';

export const MORNING_BRIEFING_PROMPT = `You are running a scheduled morning fleet briefing.

1. Call get_work_queue (limit 12) and list_agents.
2. Call get_status and get_usage_summary.
3. Summarize: blocked agents (pending permissions), failing CI, review requests, open issues, and overall fleet health.
4. Include today's spend briefly from get_usage_summary.
5. End with the top 3 recommended next actions (do not execute writes unless schedule policy allows and user already confirmed via auto_write_templates).

Keep the reply concise and scannable for a human reading the Assistant thread.`;

export const CI_SWEEP_PROMPT = `You are running a scheduled CI sweep.

1. Call get_work_queue (limit 12).
2. Identify every item with kind pr_failing_ci.
3. For each failing PR that has an agentId (or owner/repo/number), call start_agent_session with template=fix-ci and confirm=true — but only if schedule policy allows writes (auto_write_templates). Under notify_only / propose_in_chat, list the PRs and propose Fix CI instead of starting sessions.
4. Skip items already running/queued for fix-ci (tool will error; note and continue).
5. Reply with a short summary: how many failing PRs found, which Fix CI sessions started, which were skipped/proposed.

Do not address reviews, create agents from issues, or archive in this sweep.`;

export const REVIEW_SWEEP_PROMPT = `You are running a scheduled review sweep.

1. Call get_work_queue (limit 12).
2. Identify every item with kind pr_review (review requested / feedback waiting).
3. For each such PR, call start_agent_session with template=address-review and confirm=true — but only if schedule policy allows writes (auto_write_templates). Under notify_only / propose_in_chat, list the PRs and propose Address review instead of starting sessions.
4. Skip items already running/queued for address-review (tool will error; note and continue).
5. Reply with a short summary: how many review items found, which Address review sessions started, which were skipped/proposed.

Do not start fix-ci, create agents from issues, or archive in this sweep.`;

const ONCE_PROMPT_WRAPPER = `You are executing a one-time scheduled task in the Assistant thread.
Do exactly what the user requested below. Prefer a direct reply with no tools unless the request requires fleet inspection or action.

User request:
`;

const BUILTIN_PLAYBOOK_PROMPTS: Record<
  Exclude<AssistantSchedulePlaybook, 'prompt'>,
  string
> = {
  morning_fleet_briefing: MORNING_BRIEFING_PROMPT,
  ci_sweep: CI_SWEEP_PROMPT,
  review_sweep: REVIEW_SWEEP_PROMPT,
};

export function resolveSchedulePrompt(
  schedule: Pick<AssistantSchedule, 'playbook' | 'prompt' | 'kind'>,
): string {
  if (schedule.playbook !== 'prompt') {
    return BUILTIN_PLAYBOOK_PROMPTS[schedule.playbook];
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

/**
 * Write tools auto-confirmable under the auto_write_templates policy.
 *
 * `respond_permission` is deliberately absent. Under this policy the server
 * pre-sets confirm=true, so including it let an unattended scheduled run approve
 * a pending Bash or Write permission with no human present — and the only
 * remaining judgement would be the model's, which reads untrusted GitHub, Jira
 * and repository text. The reserved interactive tools are already protected,
 * which is exactly the signal that a human belongs in this loop.
 */
export const AUTO_WRITE_TEMPLATE_TOOLS = new Set([
  'start_agent_session',
  'create_agent_from_github_issue',
  'create_agent_from_jira_issue',
  'create_agent_from_pull_request',
  'send_agent_message',
  'dismiss_work_item',
  'create_agent_pull_request',
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
