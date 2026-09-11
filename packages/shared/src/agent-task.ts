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

/** Ask the server to AI-match a goal to an AgentTask by purpose. */
export interface SelectAgentTaskRequest {
  goal: string;
}

export interface SelectAgentTaskResponse {
  /** Matched AgentTask `name` slug, or `null` when no purpose fits the goal. */
  task: string | null;
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
 * Render a task prompt template. Missing/blank template returns `goal` (or empty
 * when no goal is provided) so From goal still sends the raw text by default.
 */
export interface AgentTaskPromptVars {
  goal?: string;
  plan?: string;
  planFilePath?: string;
  summary?: string;
  files?: string;
  lessons?: string;
}

export function renderAgentTaskPromptTemplate(
  template: string | null | undefined,
  vars: AgentTaskPromptVars = {},
): string {
  const goal = vars.goal?.trim() ?? '';
  const trimmed = template?.trim();
  if (!trimmed) return goal;
  return trimmed
    .replaceAll('{{goal}}', goal)
    .replaceAll('{{plan}}', vars.plan?.trim() ?? '')
    .replaceAll('{{planFilePath}}', vars.planFilePath?.trim() ?? '')
    .replaceAll('{{summary}}', vars.summary?.trim() ?? '')
    .replaceAll('{{files}}', vars.files ?? '')
    .replaceAll('{{lessons}}', vars.lessons ?? '');
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

/**
 * Permission modes an imported task file may select.
 *
 * A synced library repository decides the mode of future runs on the user's real
 * worktrees, so the modes that auto-approve tools without prompting
 * (`auto`, `dontAsk`, `bypassPermissions`) are not available to it. Anything
 * else is clamped to `plan`, which is what a new session starts in anyway; a
 * user who wants a stronger mode can set it locally after review.
 */
const IMPORTABLE_PERMISSION_MODES = new Set(['default', 'acceptEdits', 'plan']);

export function clampImportedPermissionMode(mode: string): {
  mode: 'default' | 'acceptEdits' | 'plan';
  clamped: boolean;
} {
  if (IMPORTABLE_PERMISSION_MODES.has(mode)) {
    return { mode: mode as 'default' | 'acceptEdits' | 'plan', clamped: false };
  }
  return { mode: 'plan', clamped: true };
}

/**
 * Restrict an imported `allowedTools` list to entries naming a real,
 * non-interactive tool from the catalog.
 *
 * `sanitizeAgentTaskAllowedTools` only drops interactive tools, so an imported
 * file could otherwise auto-approve an invented tool name. Scoped entries such
 * as `Bash(git:*)` stay valid — only the base name is checked.
 */
export function sanitizeImportedAllowedTools(
  tools: string | null | undefined,
  selectableToolIds: readonly string[],
): string | null {
  const sanitized = sanitizeAgentTaskAllowedTools(tools);
  if (sanitized == null) return null;
  const allowed = new Set(selectableToolIds);
  const kept = sanitized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => allowed.has(part.split('(')[0]!.trim()));
  return kept.length > 0 ? kept.join(',') : null;
}
