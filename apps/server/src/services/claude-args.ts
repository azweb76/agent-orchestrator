import { allowedToolsForPermissionMode } from './permission-protocol.js';
import type { ClaudePermissionMode } from './claude-types.js';

/** @deprecated Prefer allowedToolsForPermissionMode — kept for tests/compat. */
export const DEFAULT_ALLOWED_TOOLS = allowedToolsForPermissionMode('plan');

/** Interactive tools available for plan-mode sessions (never auto-approved). */
export const INTERACTIVE_TOOLS = 'AskUserQuestion,ExitPlanMode';

export function buildClaudeArgs(options: {
  model?: string;
  effort?: string;
  sessionId?: string | null;
  allowedTools?: string;
  permissionMode?: ClaudePermissionMode;
  defaultAllowedTools?: string;
}): string[] {
  const permissionMode = options.permissionMode ?? 'plan';
  // Print mode is required for --output-format/--input-format/--include-partial-messages.
  // Without --print the CLI can emit an assistant reply and then wait on stdin forever
  // (no result event, process never exits) — the chat UI stays "Running".
  // Do not pass the prompt as a --print argument: write it as a stream-json user
  // message on stdin so control_response replies share the same channel.
  //
  // --allowedTools auto-approves without prompting. Never list AskUserQuestion /
  // ExitPlanMode here or the agent page cannot collect answers / plan approval.
  // Omit --tools so all built-ins (including interactive plan tools) stay available.
  const allowedTools =
    options.allowedTools ??
    options.defaultAllowedTools ??
    allowedToolsForPermissionMode(permissionMode);
  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    '--allowedTools',
    allowedTools,
  ];

  if (permissionMode === 'bypassPermissions') {
    // Prefer --permission-mode so AskUserQuestion / ExitPlanMode still reach stdio prompts.
    // --dangerously-skip-permissions can suppress interactive tool gating.
    args.push('--permission-mode', 'bypassPermissions');
  } else {
    args.push('--permission-mode', permissionMode);
  }

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.effort) {
    args.push('--effort', options.effort);
  }

  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }

  return args;
}

export function buildPromptWithImages(prompt: string, imagePaths: string[]): string {
  if (imagePaths.length === 0) return prompt;
  const list = imagePaths.map((p) => `- ${p}`).join('\n');
  return `${prompt}\n\nAttached images (read these files with the Read tool):\n${list}`;
}

export function buildPromptWithMentionContext(prompt: string, mentionContext: string): string {
  const trimmed = mentionContext.trim();
  if (!trimmed) return prompt;
  if (!prompt.trim()) return trimmed;
  return `${prompt}\n\n${trimmed}`;
}

/** Initial user message written to Claude stdin in stream-json mode. */
export function buildStreamUserMessage(prompt: string): string {
  return `${JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: prompt,
    },
  })}\n`;
}
