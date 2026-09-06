import { API_BASE, authHeaders } from './request';
import type { AssistantStreamEvent } from '@agent-orchestrator/shared';
import { request } from './request';
import type {
  AssistantChatResponse,
  AssistantMessage,
  AssistantToolDefinition,
} from '@agent-orchestrator/shared';

async function consumeAssistantSse(
  response: Response,
  onEvent: (event: AssistantStreamEvent) => void,
): Promise<void> {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Assistant chat request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = 'message';
      let dataLine = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLine = line.slice(5).trim();
        }
      }

      if (!dataLine) continue;
      const data = JSON.parse(dataLine) as AssistantStreamEvent;
      if (eventType === 'error' || data.type === 'error') {
        const message =
          data.type === 'error' ? data.message : String((data as { message?: string }).message ?? 'Unknown error');
        throw new Error(message);
      }
      onEvent(data);
    }
  }
}

export async function streamAssistantChat(
  content: string,
  onEvent: (event: AssistantStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/assistant/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ content }),
    signal,
  });
  await consumeAssistantSse(response, onEvent);
}

export const apiAssistant = {
  getAssistantTools: () => request<{ tools: AssistantToolDefinition[] }>('/assistant/tools'),
  getAssistantMessages: () => request<{ messages: AssistantMessage[] }>('/assistant/messages'),
  clearAssistantMessages: () => request<void>('/assistant/messages', { method: 'DELETE' }),
  assistantChat: (content: string) =>
    request<AssistantChatResponse>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  streamAssistantChat,
};
