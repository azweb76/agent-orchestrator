/** Write/action Assistant tools (queue execution, messaging, permissions). */
import type { AssistantToolDefinition } from './assistant.js';

export const ASSISTANT_ACTION_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'start_agent_session',
    description:
      'Start a template session on an agent (fix-ci, address-review, resolve-conflicts). Pass agentId, or owner/repo/number to find/create the PR agent. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Existing agent id (preferred when known)' },
        owner: { type: 'string', description: 'GitHub owner when starting from a PR' },
        repo: { type: 'string', description: 'GitHub repo when starting from a PR' },
        number: { type: 'integer', description: 'Pull request number when starting from a PR' },
        template: {
          type: 'string',
          enum: ['fix-ci', 'address-review', 'resolve-conflicts'],
          description: 'Session template to start',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['template', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_agent_from_github_issue',
    description:
      'Create a worktree + agent from a GitHub issue (owner/repo/issueNumber). Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        issueNumber: { type: 'integer', minimum: 1 },
        name: { type: 'string', description: 'Optional agent/worktree name slug' },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['owner', 'repo', 'issueNumber', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_agent_message',
    description:
      'Send a follow-up message to an agent session (queues if busy, otherwise starts a turn). Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        message: { type: 'string', description: 'User message to send to the agent' },
        sessionId: {
          type: 'string',
          description: 'Optional session id (defaults to the agent active/latest session)',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['agentId', 'message', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_pending_permissions',
    description:
      'List pending Claude permission prompts across the fleet (or one agent). Does not approve anything.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Optional agent id to scope the listing',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'respond_permission',
    description:
      'Allow or deny a pending tool permission on an agent. For AskUserQuestion / ExitPlanMode, tell the user to open the agent UI instead. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        requestId: { type: 'string' },
        decision: { type: 'string', enum: ['allow', 'deny'] },
        message: {
          type: 'string',
          description: 'Optional deny message shown to Claude',
        },
        sessionId: { type: 'string', description: 'Optional session id' },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['agentId', 'requestId', 'decision', 'confirm'],
      additionalProperties: false,
    },
  },
];
