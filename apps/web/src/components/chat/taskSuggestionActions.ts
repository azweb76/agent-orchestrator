import type { TaskSuggestion } from '@agent-orchestrator/shared';

export type TaskSuggestionAction =
  | { type: 'prompt'; prompt: string }
  | { type: 'new-prompt'; title: string; prompt: string };

export function isOpenInNewChatClick(event: {
  metaKey?: boolean;
  ctrlKey?: boolean;
}): boolean {
  return Boolean(event.metaKey || event.ctrlKey);
}

/**
 * Resolve a follow-up chip click.
 * - Normal click: send the catalog prompt in the current chat.
 * - Cmd/Ctrl+click: open a new chat and send the same prompt.
 */
export function resolveTaskSuggestionAction(
  suggestion: TaskSuggestion,
  options: { openInNewChat?: boolean } = {},
): TaskSuggestionAction {
  if (options.openInNewChat) {
    return {
      type: 'new-prompt',
      title: suggestion.title,
      prompt: suggestion.prompt,
    };
  }
  return { type: 'prompt', prompt: suggestion.prompt };
}
