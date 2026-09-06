/** Schedule CRUD Assistant tools (cron + one-shot). */
import type { AssistantToolDefinition } from './assistant.js';
import {
  ASSISTANT_SCHEDULE_KINDS,
  ASSISTANT_SCHEDULE_PLAYBOOKS,
  ASSISTANT_SCHEDULE_POLICIES,
} from './assistant-schedules.js';

export const ASSISTANT_SCHEDULE_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'list_schedules',
    description: 'List Assistant schedules (cron and one-shot) and next/last run times.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        includePaused: {
          type: 'boolean',
          description: 'Include paused schedules (default true)',
        },
        includeCompleted: {
          type: 'boolean',
          description: 'Include completed one-shot schedules (default false)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_schedule',
    description:
      'Create a recurring cron schedule or a one-time schedule that runs an Assistant playbook into the Assistant thread. For delayed one-shots (e.g. "say hi in 5m"), prefer schedule_once. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short display name' },
        description: { type: 'string' },
        kind: {
          type: 'string',
          enum: [...ASSISTANT_SCHEDULE_KINDS],
          description: 'cron (recurring) or once (single run). Default cron.',
        },
        cron: {
          type: 'string',
          description: 'Required for kind=cron. 5-field cron. Example: 0 9 * * 1-5',
        },
        runIn: {
          type: 'string',
          description: 'For kind=once: relative delay, e.g. 5m, 1h, 30s, 1h30m',
        },
        runAt: {
          type: 'string',
          description: 'For kind=once: absolute ISO-8601 timestamp',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (default UTC)',
        },
        policy: {
          type: 'string',
          enum: [...ASSISTANT_SCHEDULE_POLICIES],
          description:
            'notify_only / propose_in_chat block writes; auto_write_templates may auto-confirm template actions',
        },
        playbook: {
          type: 'string',
          enum: [...ASSISTANT_SCHEDULE_PLAYBOOKS],
          description: 'Built-in morning_fleet_briefing or custom prompt',
        },
        prompt: {
          type: 'string',
          description: 'Required when playbook=prompt',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['name', 'policy', 'playbook', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'schedule_once',
    description:
      'Schedule a one-time Assistant task after a delay or at a time (e.g. user says "say hi in 5m"). Posts into the Assistant thread when due. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What the Assistant should do/say when the timer fires (e.g. "Say hi.")',
        },
        runIn: {
          type: 'string',
          description: 'Relative delay: 5m, 1h, 30s, 2d, 1h30m',
        },
        runAt: {
          type: 'string',
          description: 'Absolute ISO-8601 timestamp (alternative to runIn)',
        },
        name: {
          type: 'string',
          description: 'Optional short label (defaults from prompt)',
        },
        policy: {
          type: 'string',
          enum: [...ASSISTANT_SCHEDULE_POLICIES],
          description: 'Defaults to notify_only for simple reminders',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (default UTC)',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['prompt', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'pause_schedule',
    description: 'Pause or resume an Assistant schedule. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        scheduleId: { type: 'string' },
        paused: {
          type: 'boolean',
          description: 'true to pause, false to resume (default true)',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['scheduleId', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_schedule',
    description: 'Delete an Assistant schedule and its run history. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        scheduleId: { type: 'string' },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['scheduleId', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_schedule_runs',
    description: 'List recent Assistant schedule run audit entries.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        scheduleId: {
          type: 'string',
          description: 'Optional schedule id to filter',
        },
        limit: {
          type: 'integer',
          description: 'Max rows (default 20, max 50)',
        },
      },
      additionalProperties: false,
    },
  },
];
