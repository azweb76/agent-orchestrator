import { useEffect, useState, type MutableRefObject } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { streamSessionFollow } from '../../api/client';
import { createChatStreamHandlers } from './createChatStreamHandlers';

export type HandlerFactory = (
  stream: { sessionId: string },
  controller: AbortController,
  options?: { invalidateSidebar?: boolean; reportError?: boolean },
) => ReturnType<typeof createChatStreamHandlers>;

interface UseChatFollowStreamOptions {
  agentId: string;
  activeSessionId: string;
  active: boolean;
  archived: boolean;
  isSending: boolean;
  sessionRunning: boolean;
  hasStreamingMessage: boolean;
  mountedRef: MutableRefObject<boolean>;
  queryClient: QueryClient;
  followingRef: MutableRefObject<Set<string>>;
  startSessionAbort: (id: string) => AbortController;
  releaseSessionAbort: (id: string, controller: AbortController) => void;
  makeHandlerContext: HandlerFactory;
}

export function useChatFollowStream({
  agentId,
  activeSessionId,
  active,
  archived,
  isSending,
  sessionRunning,
  hasStreamingMessage,
  mountedRef,
  queryClient,
  followingRef,
  startSessionAbort,
  releaseSessionAbort,
  makeHandlerContext,
}: UseChatFollowStreamOptions) {
  const [followEpoch, setFollowEpoch] = useState(0);

  useEffect(() => {
    if (archived || !active || !activeSessionId) return;
    if (isSending) return;
    if (!sessionRunning && !hasStreamingMessage) return;

    const sid = activeSessionId;
    const stream = { sessionId: sid };
    const controller = startSessionAbort(sid);
    followingRef.current.add(sid);

    const handlers = makeHandlerContext(stream, controller, { reportError: false });

    void streamSessionFollow(agentId, sid, handlers, controller.signal)
      .catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') return;
        if (mountedRef.current) {
          queryClient.invalidateQueries({ queryKey: ['messages', agentId, sid] });
          queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
        }
      })
      .finally(() => {
        followingRef.current.delete(sid);
        releaseSessionAbort(sid, controller);
        window.setTimeout(() => {
          if (mountedRef.current) setFollowEpoch((n) => n + 1);
        }, 1_000);
      });

    return () => {
      followingRef.current.delete(sid);
      controller.abort();
    };
  }, [
    active,
    archived,
    agentId,
    activeSessionId,
    isSending,
    sessionRunning,
    hasStreamingMessage,
    followEpoch,
  ]);
}
