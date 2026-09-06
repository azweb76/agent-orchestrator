/** Depth tools: PRs, memory, usage/spend, automation settings. */
import type { AssistantToolDefinition } from './assistant.js';

export const ASSISTANT_DEPTH_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'get_pull_request',
    description:
      'Get pull request detail (and optional checks rollup) by owner/repo/number. Prefer this before starting Fix CI or Address review.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'integer', minimum: 1 },
        includeChecks: {
          type: 'boolean',
          description: 'When true, also fetch the checks rollup (default false)',
        },
      },
      required: ['owner', 'repo', 'number'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_agent_pull_request',
    description:
      'Commit (if dirty), push, and open a pull request for an agent worktree. Draft by default. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'Optional PR body markdown' },
        base: { type: 'string', description: 'Optional base branch (defaults to worktree/workspace default)' },
        draft: {
          type: 'boolean',
          description: 'Open as draft (default true)',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['agentId', 'title', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_agent_memories',
    description:
      'List durable agent memories visible for an agent (global + workspace + agent scopes).',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        includeArchived: {
          type: 'boolean',
          description: 'Include archived memories (default false)',
        },
      },
      required: ['agentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_agent_memory',
    description:
      'Create or upsert a durable memory (preference/lesson/fact) for global, workspace, or agent scope. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Agent used to resolve workspace scope and visibility',
        },
        scope: { type: 'string', enum: ['global', 'workspace', 'agent'] },
        key: { type: 'string', description: 'Stable upsert key within the scope' },
        content: { type: 'string' },
        kind: { type: 'string', enum: ['preference', 'lesson', 'fact'] },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['agentId', 'scope', 'key', 'content', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_agent_memory',
    description:
      'Update or archive a memory by id. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        memoryId: { type: 'string' },
        content: { type: 'string' },
        kind: { type: 'string', enum: ['preference', 'lesson', 'fact'] },
        key: { type: 'string' },
        status: { type: 'string', enum: ['active', 'archived'] },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['agentId', 'memoryId', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_usage_summary',
    description:
      "Fleet spend/usage rollup (today + total cost, top agents). Use for briefings and budget questions.",
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        topAgents: {
          type: 'integer',
          description: 'Max agents to include (default 8, max 20)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_automation_settings',
    description:
      'Read GitHub poll automation settings (enabled, poll interval, auto Fix CI / Address review / archive).',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'set_automation_settings',
    description:
      'Update GitHub poll automation settings. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        pollIntervalSeconds: { type: 'integer' },
        autoFixCi: { type: 'boolean' },
        autoAddressReview: { type: 'boolean' },
        autoArchiveOnMerge: { type: 'boolean' },
        autoArchiveDeleteWorktree: { type: 'boolean' },
        autoArchiveAllowDirty: { type: 'boolean' },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'trigger_automation_poll',
    description:
      'Run one GitHub automation poll cycle now (same as Settings → Check now). Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['confirm'],
      additionalProperties: false,
    },
  },
];
