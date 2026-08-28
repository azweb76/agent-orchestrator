import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { extractPlanFromInput, type PermissionRequest } from '@agent-orchestrator/shared';
import { api, streamBuildPlan, streamCompactSession } from '../../api/client';
import { createChatStreamHandlers } from './createChatStreamHandlers';
import type { HandlerFactory } from './useChatFollowStream';

interface HandoffDeps {
  agentId: string;
  archived: boolean;
  mountedRef: MutableRefObject<boolean>;
  sessionIdRef: MutableRefObject<string>;
  queryClient: QueryClient;
  abortRegistry: {
    abortBySessionRef: MutableRefObject<Map<string, AbortController>>;
    startSessionAbort: (id: string) => AbortController;
    releaseSessionAbort: (id: string, controller: AbortController) => void;
    beginSending: (id: string) => void;
    endSending: (id: string) => void;
  };
  setChatError: Dispatch<SetStateAction<string | null>>;
  setPermissionRequests: Dispatch<SetStateAction<PermissionRequest[]>>;
  setStoppedSessionId: Dispatch<SetStateAction<string | null>>;
  stickToBottom: () => void;
  makeHandlerContext: HandlerFactory;
  viewed: (sid: string) => boolean;
}

export function useChatSessionHandoffs(deps: HandoffDeps) {
  const runSessionHandoff = async (
    start: (
      fromSessionId: string,
      handlers: ReturnType<typeof createChatStreamHandlers>,
      signal: AbortSignal,
    ) => Promise<void>,
  ) => {
    if (deps.archived || !deps.mountedRef.current) return;
    const fromSessionId = deps.sessionIdRef.current;
    deps.setChatError(null);

    deps.abortRegistry.abortBySessionRef.current.get(fromSessionId)?.abort();
    await new Promise((r) => setTimeout(r, 150));
    if (!deps.mountedRef.current) return;

    deps.queryClient.invalidateQueries({ queryKey: ['queue', deps.agentId, fromSessionId] });
    deps.setPermissionRequests([]);
    deps.stickToBottom();

    const stream = { sessionId: fromSessionId };
    const controller = deps.abortRegistry.startSessionAbort(fromSessionId);
    deps.abortRegistry.beginSending(fromSessionId);

    try {
      await start(
        fromSessionId,
        deps.makeHandlerContext(stream, controller, { invalidateSidebar: true }),
        controller.signal,
      );
    } catch (error) {
      if (deps.mountedRef.current && (error as Error).name !== 'AbortError' && deps.viewed(stream.sessionId)) {
        deps.setChatError((error as Error).message);
      }
    } finally {
      void deps.queryClient.invalidateQueries({ queryKey: ['messages', deps.agentId, stream.sessionId] });
      void deps.queryClient.invalidateQueries({ queryKey: ['agent', deps.agentId] });
      void deps.queryClient.invalidateQueries({
        queryKey: ['session-context', deps.agentId, stream.sessionId],
      });
      deps.abortRegistry.releaseSessionAbort(stream.sessionId, controller);
      deps.abortRegistry.endSending(stream.sessionId);
    }
  };

  const stopStreaming = async () => {
    const sid = deps.sessionIdRef.current;
    deps.abortRegistry.abortBySessionRef.current.get(sid)?.abort();
    try {
      await api.stopSession(deps.agentId, sid);
    } catch {
      // ignore
    }
    deps.setStoppedSessionId(sid);
    deps.setPermissionRequests([]);
    deps.queryClient.invalidateQueries({ queryKey: ['messages', deps.agentId, sid] });
    deps.queryClient.invalidateQueries({ queryKey: ['agent', deps.agentId] });
    deps.queryClient.invalidateQueries({ queryKey: ['permissions', deps.agentId, sid] });
    deps.queryClient.invalidateQueries({ queryKey: ['session-context', deps.agentId, sid] });
  };

  const buildPlan = async (request: PermissionRequest, setPermissionBusy: (v: boolean) => void) => {
    if (deps.archived || !deps.mountedRef.current) return;
    setPermissionBusy(true);
    const plan = extractPlanFromInput(request.input);
    try {
      await runSessionHandoff((fromSessionId, handlers, signal) =>
        streamBuildPlan(
          deps.agentId,
          fromSessionId,
          { requestId: request.requestId, plan: plan || undefined },
          handlers,
          signal,
        ),
      );
    } finally {
      if (deps.mountedRef.current) setPermissionBusy(false);
    }
  };

  const compactAndContinue = async (
    setCompacting: (v: boolean) => void,
    clearStopped: () => void,
  ) => {
    if (deps.archived || !deps.mountedRef.current) return;
    setCompacting(true);
    clearStopped();
    try {
      await runSessionHandoff((fromSessionId, handlers, signal) =>
        streamCompactSession(deps.agentId, fromSessionId, handlers, signal),
      );
    } finally {
      if (deps.mountedRef.current) setCompacting(false);
    }
  };

  return { runSessionHandoff, stopStreaming, buildPlan, compactAndContinue };
}
