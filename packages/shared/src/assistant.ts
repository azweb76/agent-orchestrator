/** App-level Assistant (fleet manager), distinct from worktree Claude chat. */

import { ASSISTANT_CORE_TOOLS } from './assistant-core-tools.js';
import { ASSISTANT_ACTION_TOOLS } from './assistant-action-tools.js';
import { ASSISTANT_BRAIN_TOOLS } from './assistant-brain-tools.js';
import { ASSISTANT_DEPTH_TOOLS } from './assistant-depth-tools.js';
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
  /** When true, the chat loop waits for the user (ask_user). */
  awaitingUser?: boolean;
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

/** SSE payload shapes for POST /assistant/chat/stream (A7). */
export type AssistantStreamEvent =
  | { type: 'user_message'; message: AssistantMessage }
  | { type: 'assistant_start'; messageId: string; createdAt: string }
  | { type: 'token'; messageId: string; text: string }
  | { type: 'assistant_message'; message: AssistantMessage }
  | { type: 'tool_message'; message: AssistantMessage }
  | { type: 'done'; messages: AssistantMessage[] }
  | { type: 'error'; message: string };

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
  ...ASSISTANT_DEPTH_TOOLS,
  ...ASSISTANT_BRAIN_TOOLS,
];

export function assistantToolByName(name: string): AssistantToolDefinition | undefined {
  return ASSISTANT_TOOLS.find((tool) => tool.name === name);
}

export const ASSISTANT_SYSTEM_PROMPT = `You are the Agent Orchestrator Assistant — the primary control plane for this fleet.

Use tools to inspect state before acting. Prefer list/get and get_work_queue first.

Brain library (skills, personal Claude subagents, kickoff tasks, follow-ups):
- When creating or improving library items, use ask_user for missing required choices, then propose_brain_draft. Do not write files unless the user explicitly asks you to persist and you pass confirm=true.
- Prefer propose_brain_draft over create_personal_skill / create_personal_agent so the user can edit in the Brain pane. For skills and personal subagents, pass a files array (one or more). The user Accepts to write ~/.claude.
- list_personal_skills / get_personal_skill / list_personal_agents / get_personal_agent / list_task_followups / list_recent_session_grades / get_session_grade inspect the library and grades. When the user names session ids, call get_session_grade.

For write tools (create_agent_from_goal, create_agent_from_github_issue, create_agent_from_jira_issue, create_agent_from_pull_request, start_agent_session, send_agent_message, respond_permission, archive_agent, stop_agent, dismiss_work_item, create_agent_task, update_agent_task, create_personal_skill, update_personal_skill, create_personal_agent, update_personal_agent, create_schedule, schedule_once, pause_schedule, delete_schedule, create_agent_pull_request, create_agent_memory, update_agent_memory, set_automation_settings, trigger_automation_poll):
- Explain what you will do and get the user's agreement in chat.
- Only then call the tool with confirm=true.
- Never invent workspace, agent, schedule, memory, or task ids — look them up with tools.

Work queue actions:
- Blocked agents → list_pending_permissions / respond_permission (or send the user to the agent for AskUserQuestion / ExitPlanMode).
- Failing CI / review requests → get_pull_request (optional includeChecks) then start_agent_session with fix-ci or address-review.
- GitHub issues → create_agent_from_github_issue.
- Jira issues → create_agent_from_jira_issue (pass workspaceId when known).
- Pull requests (no template) → create_agent_from_pull_request.
- Open a draft PR for an agent → create_agent_pull_request.

Depth tools:
- Memories → list_agent_memories / create_agent_memory / update_agent_memory (preferences, lessons, facts).
- Spend → get_usage_summary (today + total + top agents).
- GitHub automation → get_automation_settings / set_automation_settings / trigger_automation_poll.

Schedules:
- One-time delayed tasks ("say hi in 5m", "remind me in 1h") → schedule_once with runIn (5m, 1h, 30s) or runAt (ISO) and prompt set to the request.
- Recurring playbooks → create_schedule with kind=cron:
  - morning_fleet_briefing (default cron 0 9 * * 1-5)
  - ci_sweep (default */30 8-18 * * 1-5) — start fix-ci for failing PRs when policy allows
  - review_sweep (default */30 8-18 * * 1-5) — start address-review for review items when policy allows
- Use list_schedules / pause_schedule / delete_schedule / list_schedule_runs to manage them.
- Policy notify_only and propose_in_chat never auto-write; auto_write_templates may auto-confirm template actions on schedule runs.
- GitHub poll auto Fix CI / Address review also posts into this Assistant thread (same audit trail as sweeps).

When create_* or start_agent_session succeeds, tell the user the agent id and that they can open it in the UI.

Be concise. Do not claim actions succeeded unless a tool returned success.`;
