import type { EffortLevel, PermissionMode } from './types/entities.js';
import { DEFAULT_EFFORT_LEVEL, DEFAULT_PERMISSION_MODE } from './constants.js';

/** Stable slug for the Create agent → From goal action. */
export const FROM_GOAL_PROFILE_NAME = 'from-goal';

/** Session profile name: lowercase slug, max 63 chars. */
export const SESSION_PROFILE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * Configurable kickoff / run defaults for a chat session.
 * Built-in profiles (e.g. `from-goal`) are seeded by the server and cannot be deleted.
 */
export interface SessionProfile {
  id: string;
  /** Unique slug used by actions and APIs (e.g. `from-goal`). */
  name: string;
  title: string;
  description: string;
  /**
   * Initial user message template. Use `{{goal}}` for the From goal text.
   * `null` / empty sends the raw goal (or leaves the composer empty for listed profiles).
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

export interface CreateSessionProfileRequest {
  name: string;
  title: string;
  description?: string;
  promptTemplate?: string | null;
  systemPrompt?: string | null;
  allowedTools?: string | null;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  listed?: boolean;
}

export interface UpdateSessionProfileRequest {
  title?: string;
  description?: string;
  promptTemplate?: string | null;
  systemPrompt?: string | null;
  allowedTools?: string | null;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  listed?: boolean;
  /** Only allowed when creating non-built-in profiles; ignored for built-in. */
  name?: string;
}

/** Default shape for the From goal built-in profile (id/timestamps filled by the server). */
export function defaultFromGoalProfile(
  overrides: Partial<Omit<SessionProfile, 'id' | 'createdAt' | 'updatedAt' | 'name' | 'builtIn'>> = {},
): Omit<SessionProfile, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: FROM_GOAL_PROFILE_NAME,
    title: 'From goal',
    description: 'Used when creating an agent from a free-form goal.',
    promptTemplate: null,
    systemPrompt: null,
    allowedTools: null,
    model: 'sonnet',
    effort: DEFAULT_EFFORT_LEVEL,
    permissionMode: DEFAULT_PERMISSION_MODE,
    listed: false,
    builtIn: true,
    ...overrides,
  };
}

/**
 * Render a profile prompt template. Missing/blank template returns `goal` unchanged
 * so From goal still sends the raw text by default.
 */
export function renderProfilePromptTemplate(
  template: string | null | undefined,
  vars: { goal: string },
): string {
  const goal = vars.goal.trim();
  const trimmed = template?.trim();
  if (!trimmed) return goal;
  return trimmed.replaceAll('{{goal}}', goal);
}

/** Drop interactive tools that must never be auto-approved via `--allowedTools`. */
export function sanitizeProfileAllowedTools(
  tools: string | null | undefined,
): string | null {
  if (tools == null) return null;
  const parts = tools
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== 'AskUserQuestion' && part !== 'ExitPlanMode');
  return parts.length > 0 ? parts.join(',') : null;
}

export function isValidSessionProfileName(name: string): boolean {
  return SESSION_PROFILE_NAME_PATTERN.test(name.trim());
}
