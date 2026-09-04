import {
  CHAT_SESSION_TEMPLATES,
  type ChatSessionTemplate,
  type TaskSuggestion,
} from '@agent-orchestrator/shared';

/**
 * Resolve a "Suggested follow-ups" chip into a chat send, session template,
 * or commit-dialog handoff.
 */
export function resolveTaskSuggestionAction(
  suggestion: TaskSuggestion,
):
  | { type: 'commit-and-push' }
  | { type: 'start-template'; template: ChatSessionTemplate }
  | { type: 'prompt'; prompt: string } {
  if (suggestion.kind === 'commit-and-push') {
    return { type: 'commit-and-push' };
  }
  if (suggestion.kind === 'start-template' && suggestion.template) {
    const template = CHAT_SESSION_TEMPLATES.find((item) => item.id === suggestion.template);
    if (template) return { type: 'start-template', template };
  }
  return { type: 'prompt', prompt: suggestion.prompt };
}
