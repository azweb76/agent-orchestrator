/** Schedule CRUD Assistant tools. */
import type { AssistantToolDefinition } from './assistant.js';
import { ASSISTANT_SCHEDULE_PLAYBOOKS, ASSISTANT_SCHEDULE_POLICIES } from './assistant-schedules.js';

export const ASSISTANT_SCHEDULE_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'list_schedules',
    description: 'List Assistant schedules (cron playbooks) and recent run status.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        includePaused: {
          type: 'boolean',
          description: 'Include paused schedules (default true)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_schedule',
    description:
      'Create a cron schedule that runs an Assistant playbook into the Assistant thread. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short display name' },
        description: { type: 'string' },
        cron: {
          type: 'string',
          description: '5-field cron (minute hour day-of-month month day-of-week). Example: 0 9 * * 1-5',
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
      required: ['name', 'cron', 'policy', 'playbook', 'confirm'],
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
