import { isInteractiveAllowedToolEntry } from './claude-tools.js';
import type { EffortLevel, PermissionMode } from './types/entities.js';

/** Agent task name: lowercase slug, max 63 chars. */
export const AGENT_TASK_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * Configurable kickoff / run defaults for a chat session.
 * Built-in tasks cannot be deleted; name is locked when `builtIn` is true.
 */
export interface AgentTask {
  id: string;
  /** Unique slug used by actions and APIs. */
  name: string;
  title: string;
  description: string;
  /**
   * When this task is appropriate for the work. Used by From goal Auto to match a goal.
   */
  purpose: string;
  /**
   * Initial user message template. Use `{{goal}}` for the From goal text.
   * `null` / empty sends the raw goal (or leaves the composer empty for listed tasks).
   */
  promptTemplate: string | null;
  /** Appended to Claude Code’s system prompt via `--append-system-prompt`. */
  systemPrompt: string | null;
  /**
   * Comma-separated `--allowedTools` override. `null` derives tools from `permissionMode`.
   * Never include AskUserQuestion or ExitPlanMode (those must hit the UI).
   */
  allowedTools: string | null;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  /** Shown in the new-session picker when true. */
  listed: boolean;
  /** Seeded by the app; name is locked and delete is blocked. */
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentTaskRequest {
  name: string;
  title: string;
  description?: string;
  purpose?: string;
  promptTemplate?: string | null;
  systemPrompt?: string | null;
  allowedTools?: string | null;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  listed?: boolean;
}

export interface UpdateAgentTaskRequest {
  title?: string;
  description?: string;
  purpose?: string;
  promptTemplate?: string | null;
  systemPrompt?: string | null;
  allowedTools?: string | null;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  listed?: boolean;
  /** Only allowed for non-built-in tasks; ignored for built-in. */
  name?: string;
}

/**
 * Render a task prompt template. Missing/blank template returns `goal` unchanged
 * so From goal still sends the raw text by default.
 */
export function renderAgentTaskPromptTemplate(
  template: string | null | undefined,
  vars: { goal: string },
): string {
  const goal = vars.goal.trim();
  const trimmed = template?.trim();
  if (!trimmed) return goal;
  return trimmed.replaceAll('{{goal}}', goal);
}

/** Drop interactive tools that must never be auto-approved via `--allowedTools`. */
export function sanitizeAgentTaskAllowedTools(
  tools: string | null | undefined,
): string | null {
  if (tools == null) return null;
  const parts = tools
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isInteractiveAllowedToolEntry(part));
  return parts.length > 0 ? parts.join(',') : null;
}

export function isValidAgentTaskName(name: string): boolean {
  return AGENT_TASK_NAME_PATTERN.test(name.trim());
}
