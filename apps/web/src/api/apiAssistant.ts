import { request } from './request';
import type {
  AssistantChatResponse,
  AssistantMessage,
  AssistantToolDefinition,
} from '@agent-orchestrator/shared';

export const apiAssistant = {
  getAssistantTools: () => request<{ tools: AssistantToolDefinition[] }>('/assistant/tools'),
  getAssistantMessages: () => request<{ messages: AssistantMessage[] }>('/assistant/messages'),
  clearAssistantMessages: () => request<void>('/assistant/messages', { method: 'DELETE' }),
  assistantChat: (content: string) =>
    request<AssistantChatResponse>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};
