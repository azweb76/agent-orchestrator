import {
  CHAT_SESSION_TEMPLATES,
  type ChatSessionTemplate,
  type TaskSuggestion,
} from '@agent-orchestrator/shared';

export type TaskSuggestionAction =
  | { type: 'commit-and-push' }
  | { type: 'start-template'; template: ChatSessionTemplate }
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
 * - Normal click: send the prompt in the current chat (Commit and Push stays a dialog).
 * - Cmd/Ctrl+click: open a new chat (template kinds use their session template).
 */
export function resolveTaskSuggestionAction(
  suggestion: TaskSuggestion,
  options: { openInNewChat?: boolean } = {},
): TaskSuggestionAction {
  const openInNewChat = Boolean(options.openInNewChat);

  if (!openInNewChat) {
    if (suggestion.kind === 'commit-and-push') {
      return { type: 'commit-and-push' };
    }
    return { type: 'prompt', prompt: suggestion.prompt };
  }

  if (suggestion.kind === 'start-template' && suggestion.template) {
    const template = CHAT_SESSION_TEMPLATES.find((item) => item.id === suggestion.template);
    if (template) return { type: 'start-template', template };
  }

  if (suggestion.kind === 'commit-and-push') {
    return { type: 'commit-and-push' };
  }

  return {
    type: 'new-prompt',
    title: suggestion.title,
    prompt: suggestion.prompt,
  };
}
