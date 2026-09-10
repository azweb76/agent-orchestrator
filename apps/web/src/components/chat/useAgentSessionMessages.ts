import { useQueries, useQueryClient } from '@tanstack/react-query';
import { mergeChatMessages, type ChatSession, type Message } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { useSseConnectionState } from '../../api/events';
import { SSE_FALLBACK_ACTIVE_POLL_MS } from '../../api/ssePolling';

export function useAgentSessionMessages(options: {
  agentId: string;
  sessions: ChatSession[];
  active: boolean;
  sendingSessionsRef: React.MutableRefObject<Set<string>>;
  followingRef: React.MutableRefObject<Set<string>>;
}): {
  messagesBySession: Record<string, Message[]>;
  isLoading: boolean;
  error: Error | null;
} {
  const { agentId, sessions, active, sendingSessionsRef, followingRef } = options;
  const queryClient = useQueryClient();
  const sseState = useSseConnectionState();
  const sessionIds = sessions.map((item) => item.id);
  const statusById = new Map(sessions.map((item) => [item.id, item.status]));

  const queries = useQueries({
    queries: sessionIds.map((sessionId) => ({
      queryKey: ['messages', agentId, sessionId],
      queryFn: async () => {
        const remote = await api.getMessages(agentId, sessionId);
        const local = queryClient.getQueryData<Message[]>(['messages', agentId, sessionId]);
        return mergeChatMessages(local, remote);
      },
      enabled: active && Boolean(sessionId),
      refetchOnWindowFocus: true,
      refetchInterval: () => {
        if (!active) return false;
        if (sseState === 'connected') return false;
        if (sendingSessionsRef.current.has(sessionId)) return false;
        if (followingRef.current.has(sessionId)) return false;
        const cached = queryClient.getQueryData<Message[]>(['messages', agentId, sessionId]);
        const streaming = cached?.some((item) => item.metadata?.streaming);
        if (statusById.get(sessionId) === 'running' || streaming) {
          return SSE_FALLBACK_ACTIVE_POLL_MS;
        }
        return false;
      },
    })),
  });

  const messagesBySession: Record<string, Message[]> = {};
  for (let index = 0; index < sessionIds.length; index += 1) {
    const sessionId = sessionIds[index];
    if (!sessionId) continue;
    messagesBySession[sessionId] = queries[index]?.data ?? [];
  }

  const hasAnyData = queries.some((query) => (query.data?.length ?? 0) > 0);
  const isLoading = queries.some((query) => query.isLoading) && !hasAnyData;
  const errorQuery = queries.find((query) => query.error);
  const error = errorQuery?.error ? (errorQuery.error as Error) : null;

  return { messagesBySession, isLoading, error };
}
