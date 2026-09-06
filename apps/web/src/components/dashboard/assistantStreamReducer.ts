import type { AssistantMessage, AssistantStreamEvent } from '@agent-orchestrator/shared';

/** Fold one Assistant SSE event into the local message list. */
export function applyAssistantStreamEvent(
  messages: AssistantMessage[],
  event: AssistantStreamEvent,
): AssistantMessage[] {
  switch (event.type) {
    case 'user_message': {
      const withoutOptimistic = messages.filter((msg) => !msg.id.startsWith('optimistic-'));
      return [...withoutOptimistic, event.message];
    }
    case 'assistant_start':
      return [
        ...messages,
        {
          id: event.messageId,
          role: 'assistant',
          content: '',
          createdAt: event.createdAt,
        },
      ];
    case 'token':
      return messages.map((msg) =>
        msg.id === event.messageId ? { ...msg, content: msg.content + event.text } : msg,
      );
    case 'assistant_message':
      return messages.map((msg) => (msg.id === event.message.id ? event.message : msg));
    case 'tool_message':
      return [...messages, event.message];
    case 'done':
    case 'error':
      return messages;
    default:
      return messages;
  }
}
