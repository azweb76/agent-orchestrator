import type { EffortLevel, PermissionMode } from './types/entities.js';

export const CLAUDE_MODELS = [
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'opus', label: 'Claude Opus' },
  { id: 'haiku', label: 'Claude Haiku' },
] as const;

export const CLAUDE_EFFORT_LEVELS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
] as const satisfies ReadonlyArray<{ id: EffortLevel; label: string }>;

export const DEFAULT_EFFORT_LEVEL: EffortLevel = 'high';

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'plan';

/** API error `code` when creating a new worktree branch that already exists locally. */
export const BRANCH_EXISTS_ERROR_CODE = 'BRANCH_EXISTS' as const;

export const PERMISSION_MODES = [
  { id: 'default', label: 'Manual' },
  { id: 'acceptEdits', label: 'Accept edits' },
  { id: 'plan', label: 'Plan' },
  { id: 'auto', label: 'Auto' },
  { id: 'dontAsk', label: "Don't ask" },
  { id: 'bypassPermissions', label: 'Bypass permissions' },
] as const satisfies ReadonlyArray<{ id: PermissionMode; label: string }>;

const CHAT_SLASH_COMMANDS = [
  { command: '/diff', prompt: 'Show a summary of the current git diff and what still needs work.' },
  { command: '/test', prompt: 'Run the relevant tests for recent changes and fix any failures.' },
  { command: '/pr', prompt: 'Prepare a pull request: summarize changes, suggest a title and description.' },
  { command: '/review', prompt: 'Review the current changes for bugs, edge cases, and missing tests.' },
] as const;

/** How a slash command should be handled by the orchestrator chat UI. */
export type SlashCommandKind = 'local' | 'prompt' | 'skill' | 'context';

export interface SlashCommand {
  /** Fully-qualified command including leading slash, e.g. `/clear` or `/code-review`. */
  command: string;
  /** Short human-readable description shown in autocomplete. */
  description: string;
  kind: SlashCommandKind;
  /**
   * For `prompt` commands: text sent to Claude instead of the raw command.
   * For `skill` commands: omitted (the command itself is sent through).
   * For `local` commands: omitted (handled in the client).
   */
  prompt?: string;
  /** Optional aliases that also match this command (e.g. `/reset` → `/clear`). */
  aliases?: string[];
  /** Where the command was discovered from. */
  source?: 'app' | 'project' | 'personal' | 'bundled';
}

/** Built-in orchestrator-local slash commands (not forwarded to Claude). */
export const LOCAL_SLASH_COMMANDS: SlashCommand[] = [
  {
    command: '/clear',
    description: 'Clear chat history and reset the Claude session',
    kind: 'local',
    aliases: ['/reset', '/new'],
    source: 'app',
  },
  {
    command: '/rewind',
    description: 'Rewind to the last user message (edit and resend)',
    kind: 'local',
    aliases: ['/undo'],
    source: 'app',
  },
];

/**
 * Bundled Claude Code skills that work when sent as a prompt in print mode.
 * Discovered project/personal skills are merged on top at runtime.
 */
export const BUNDLED_SKILL_COMMANDS: SlashCommand[] = [
  { command: '/batch', description: 'Orchestrate large parallel codebase changes', kind: 'skill', source: 'bundled' },
  { command: '/code-review', description: 'Review the current diff for bugs and cleanups', kind: 'skill', source: 'bundled', aliases: ['/review'] },
  { command: '/debug', description: 'Enable debug logging and troubleshoot issues', kind: 'skill', source: 'bundled' },
  { command: '/doctor', description: 'Run a Claude Code setup checkup', kind: 'skill', source: 'bundled', aliases: ['/checkup'] },
  { command: '/simplify', description: 'Clean up changed code and apply fixes', kind: 'skill', source: 'bundled' },
  { command: '/verify', description: 'Build and run the app to confirm a change works', kind: 'skill', source: 'bundled' },
  { command: '/run', description: 'Launch and drive the project app', kind: 'skill', source: 'bundled' },
  { command: '/security-review', description: 'Check the branch diff for security issues', kind: 'skill', source: 'bundled' },
  { command: '/init', description: 'Initialize project with a CLAUDE.md guide', kind: 'skill', source: 'bundled' },
];

/** Orchestrator-side context slash commands (/diff, /test, /pr). */
export const CONTEXT_SLASH_COMMANDS: SlashCommand[] = CHAT_SLASH_COMMANDS.filter(
  (item) => item.command !== '/review',
).map((item) => ({
  command: item.command,
  description: item.prompt,
  kind: 'context' as const,
  prompt: item.prompt,
  source: 'app' as const,
}));

/** @deprecated Use CONTEXT_SLASH_COMMANDS — kept for older imports. */
export const PROMPT_SLASH_COMMANDS: SlashCommand[] = CONTEXT_SLASH_COMMANDS;
