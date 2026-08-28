import type { QueryClient } from '@tanstack/react-query';
import type { AgentDetail, ChatSession, Message } from '@agent-orchestrator/shared';

export function upsertMessage(messages: Message[] | undefined, message: Message): Message[] {
  if (!messages?.length) return [message];
  const index = messages.findIndex((item) => item.id === message.id);
  if (index < 0) return [...messages, message];
  const next = [...messages];
  next[index] = message;
  return next;
}

export function setMessagesCache(
  queryClient: QueryClient,
  agentId: string,
  sessionId: string,
  updater: (prev: Message[] | undefined) => Message[],
): void {
  queryClient.setQueryData<Message[]>(['messages', agentId, sessionId], (prev) => updater(prev));
}

export function upsertAgentSession(
  queryClient: QueryClient,
  agentId: string,
  session: ChatSession,
  options: { activate?: boolean } = {},
): void {
  queryClient.setQueryData<AgentDetail>(['agent', agentId], (prev) => {
    if (!prev) return prev;
    const sessions = prev.sessions ?? [];
    const has = sessions.some((item) => item.id === session.id);
    return {
      ...prev,
      ...(options.activate ? { activeSessionId: session.id } : {}),
      sessions: has
        ? sessions.map((item) => (item.id === session.id ? { ...item, ...session } : item))
        : [...sessions, session],
    };
  });
  if (session.status === 'queued') {
    queryClient.invalidateQueries({ queryKey: ['queue', agentId, session.id] });
  }
}
