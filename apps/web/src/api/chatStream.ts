import type { BuildPlanRequest } from '@agent-orchestrator/shared';
import { API_BASE, authHeaders } from './request';
import type { ChatStreamHandlers, StreamChatOptions } from './types';
import type { ChatSession, Message, PermissionRequest } from '@agent-orchestrator/shared';

async function consumeChatSse(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<void> {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Chat request failed');
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
      const data = JSON.parse(dataLine) as Record<string, unknown>;

      if (eventType === 'token') {
        handlers.onToken(String(data.text ?? ''));
      } else if (eventType === 'event') {
        handlers.onEvent(data);
      } else if (eventType === 'permission_request') {
        handlers.onPermissionRequest?.(data as unknown as PermissionRequest);
      } else if (eventType === 'user_message') {
        handlers.onUserMessage?.(data as unknown as Message);
      } else if (eventType === 'assistant_message') {
        handlers.onAssistantMessage?.(data as unknown as Message);
      } else if (eventType === 'session') {
        handlers.onSession?.(data as unknown as ChatSession);
      } else if (eventType === 'done') {
        handlers.onDone(data as { message: Message; sessionId: string | null; chatSessionId?: string });
      } else if (eventType === 'error') {
        handlers.onError(String(data.message ?? 'Unknown error'));
      }
    }
  }
}

export async function streamChat(
  agentId: string,
  sessionId: string,
  options: StreamChatOptions,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${agentId}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({
      message: options.message,
      force: options.force,
      images: options.images,
      mentions: options.mentions,
    }),
    signal,
  });

  await consumeChatSse(response, handlers);
}

/** Attach to an already-running (or just-finished) session without sending a prompt. */
export async function streamSessionFollow(
  agentId: string,
  sessionId: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${agentId}/sessions/${sessionId}/stream`, {
    method: 'GET',
    headers: authHeaders(),
    credentials: 'include',
    signal,
  });

  await consumeChatSse(response, handlers);
}

/**
 * Compact-and-continue: summarize the hot session, stash it, and stream the
 * continuation session seeded with the summary and files in play.
 */
export async function streamCompactSession(
  agentId: string,
  sessionId: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${agentId}/sessions/${sessionId}/compact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    signal,
  });

  await consumeChatSse(response, handlers);
}

/** Stash the plan session, create a Build session, and stream implementation. */
export async function streamBuildPlan(
  agentId: string,
  sessionId: string,
  body: BuildPlanRequest,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/agents/${agentId}/sessions/${sessionId}/permissions/build`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify(body),
      signal,
    },
  );

  await consumeChatSse(response, handlers);
}
