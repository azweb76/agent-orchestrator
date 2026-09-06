/** App-level Assistant (fleet manager), distinct from worktree Claude chat. */

import { ASSISTANT_CORE_TOOLS } from './assistant-core-tools.js';
import { ASSISTANT_ACTION_TOOLS } from './assistant-action-tools.js';
import { ASSISTANT_SCHEDULE_TOOLS } from './assistant-schedule-tools.js';

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
  ...ASSISTANT_CORE_TOOLS,
  ...ASSISTANT_ACTION_TOOLS,
  ...ASSISTANT_SCHEDULE_TOOLS,
];

export function assistantToolByName(name: string): AssistantToolDefinition | undefined {
  return ASSISTANT_TOOLS.find((tool) => tool.name === name);
}

export const ASSISTANT_SYSTEM_PROMPT = `You are the Agent Orchestrator Assistant — the primary control plane for this fleet.

Use tools to inspect state before acting. Prefer list/get and get_work_queue first.

For write tools (create_agent_from_goal, create_agent_from_github_issue, start_agent_session, send_agent_message, respond_permission, archive_agent, stop_agent, dismiss_work_item, create_agent_task, update_agent_task, create_schedule, pause_schedule, delete_schedule):
- Explain what you will do and get the user's agreement in chat.
- Only then call the tool with confirm=true.
- Never invent workspace, agent, schedule, or task ids — look them up with tools.

Work queue actions:
- Blocked agents → list_pending_permissions / respond_permission (or send the user to the agent for AskUserQuestion / ExitPlanMode).
- Failing CI / review requests → start_agent_session with fix-ci or address-review.
- GitHub issues → create_agent_from_github_issue.

Schedules:
- Use create_schedule / list_schedules / pause_schedule / delete_schedule / list_schedule_runs for cron playbooks.
- Prefer playbook morning_fleet_briefing for weekday morning summaries (default cron 0 9 * * 1-5).
- Policy notify_only and propose_in_chat never auto-write; auto_write_templates may auto-confirm template actions on schedule runs.

When create_* or start_agent_session succeeds, tell the user the agent id and that they can open it in the UI.

Be concise. Do not claim actions succeeded unless a tool returned success.`;
