/** App-level Assistant (fleet manager), distinct from worktree Claude chat. */

export type AssistantMessageRole = 'user' | 'assistant' | 'tool';

export type AssistantToolRisk = 'read' | 'write';

export interface AssistantToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AssistantToolResultMeta {
  toolUseId: string;
  toolName: string;
  isError?: boolean;
  /** When a mutating tool created an agent, UI can navigate here. */
  navigateTo?: string;
  agentId?: string;
}

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  /** Structured tool calls on assistant turns. */
  toolCalls?: AssistantToolCall[];
  /** Present on role=tool messages. */
  toolResult?: AssistantToolResultMeta;
  createdAt: string;
}

export interface AssistantChatRequest {
  content: string;
}

export interface AssistantChatResponse {
  messages: AssistantMessage[];
}

/** JSON Schema fragment compatible with Anthropic tools and MCP. */
export type AssistantJsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface AssistantToolDefinition {
  name: string;
  description: string;
  risk: AssistantToolRisk;
  inputSchema: AssistantJsonSchema;
}

/** Built-in Assistant tools (single registry for in-app + MCP). */
export const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'list_workspaces',
    description: 'List all GitHub workspaces with worktree and agent counts.',
    risk: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_agents',
    description:
      'List agents across the fleet (id, name, status, workspace, delivery phase). Omit archived by default.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        includeArchived: {
          type: 'boolean',
          description: 'Include archived agents (default false).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_agent',
    description: 'Get detail for one agent including workspace, worktree, and sessions summary.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent id' },
      },
      required: ['agentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_agent_tasks',
    description: 'List kickoff AgentTask templates (slug, title, purpose, model defaults).',
    risk: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_agent_task',
    description:
      'Get one AgentTask by id (taskId) or slug (task), including prompt/system templates and tool defaults.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'AgentTask id' },
        task: { type: 'string', description: 'AgentTask slug (name)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'update_agent_task',
    description:
      'Update an AgentTask template (prompt, purpose, model, tools, etc.). Identify with taskId or task slug. Built-in tasks cannot be renamed. Requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'AgentTask id' },
        task: { type: 'string', description: 'AgentTask slug (name) to find' },
        name: {
          type: 'string',
          description: 'New slug (non-built-in only)',
        },
        title: { type: 'string', description: 'Display title' },
        description: { type: 'string' },
        purpose: {
          type: 'string',
          description: 'When this task fits a goal (used by From goal Auto)',
        },
        promptTemplate: {
          type: ['string', 'null'],
          description: 'Kickoff prompt template; use {{goal}}. null clears.',
        },
        systemPrompt: {
          type: ['string', 'null'],
          description: 'Appended system prompt. null clears.',
        },
        allowedTools: {
          type: ['string', 'null'],
          description: 'Comma-separated --allowedTools override. null clears.',
        },
        model: { type: 'string' },
        effort: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
        permissionMode: {
          type: 'string',
          enum: ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'],
        },
        listed: {
          type: 'boolean',
          description: 'Show in the new-session picker',
        },
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
    name: 'get_status',
    description: 'System readiness: Claude CLI, GitHub token, Jira, auth, archived count.',
    risk: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_work_queue',
    description:
      'Needs-attention work queue (blocked agents, failing CI, review requests, open issues).',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Max items (default 8)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_inbox',
    description: 'Summarize PR inbox, assigned GitHub issues, and Jira issues (when configured).',
    risk: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_agent_from_goal',
    description:
      'Create a new worktree + agent from a goal in a workspace. Requires confirm=true after the user agrees. task is an AgentTask slug or "auto".',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Target workspace id' },
        goal: { type: 'string', description: 'Natural-language goal for the agent' },
        task: {
          type: 'string',
          description: 'AgentTask slug or "auto" to pick by purpose',
        },
        name: { type: 'string', description: 'Optional worktree/agent name slug' },
        baseBranch: { type: 'string', description: 'Optional base branch (default: workspace default)' },
        model: { type: 'string', description: 'Optional model override' },
        effort: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'xhigh', 'max'],
          description: 'Optional effort override',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute; ask the user first if unset/false',
        },
      },
      required: ['workspaceId', 'goal', 'task', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'archive_agent',
    description: 'Archive an agent (stops sessions). Requires confirm=true. Does not delete the worktree.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        confirm: {
          type: 'boolean',
          description: 'Must be true to execute',
        },
      },
      required: ['agentId', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'dismiss_work_item',
    description: 'Snooze/dismiss a work-queue item id so it leaves the needs-attention list.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        workItemId: { type: 'string', description: 'Work item id from get_work_queue' },
        confirm: { type: 'boolean', description: 'Must be true to execute' },
      },
      required: ['workItemId', 'confirm'],
      additionalProperties: false,
    },
  },
];

export function assistantToolByName(name: string): AssistantToolDefinition | undefined {
  return ASSISTANT_TOOLS.find((tool) => tool.name === name);
}

export const ASSISTANT_SYSTEM_PROMPT = `You are the Agent Orchestrator Assistant. You help the user manage workspaces, agents, agent tasks, and the work queue.

Use tools to inspect state before acting. Prefer list/get tools first.

For write tools (create_agent_from_goal, archive_agent, dismiss_work_item, update_agent_task):
- Explain what you will do and get the user's agreement in chat.
- Only then call the tool with confirm=true.
- Never invent workspace, agent, or task ids — look them up with tools.

When editing agent tasks, call list_agent_tasks or get_agent_task first, then update_agent_task with confirm=true.

When create_agent_from_goal succeeds, tell the user the new agent id and that they can open it in the UI.

Be concise. Do not claim actions succeeded unless a tool returned success.`;
