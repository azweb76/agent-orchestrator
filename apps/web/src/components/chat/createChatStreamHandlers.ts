import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { adoptParentClaudeSessionId, type ChatSession, type Message, type PermissionRequest } from '@agent-orchestrator/shared';
import { api, type ChatStreamHandlers } from '../../api/client';
import { applyEventToAssistant } from './messageTimelineItems';
import { setMessagesCache, upsertAgentSession, upsertMessage } from './chatQueryCache';

export interface StreamHandlerContext {
  agentId: string;
  queryClient: QueryClient;
  mountedRef: MutableRefObject<boolean>;
  sessionIdRef: MutableRefObject<string>;
  parentClaudeBySessionRef: MutableRefObject<Record<string, string>>;
  sessions: ChatSession[];
  sendingSessionsRef: MutableRefObject<Set<string>>;
  abortBySessionRef: MutableRefObject<Map<string, AbortController>>;
  setSendingSessionIds: Dispatch<SetStateAction<string[]>>;
  setSessionId: (id: string) => void;
  setPermissionRequests: Dispatch<SetStateAction<PermissionRequest[]>>;
  setChatError: Dispatch<SetStateAction<string | null>>;
  streamingPatches: {
    appendToken: (sid: string, token: string) => void;
    patchStreaming: (sid: string, mutate: (message: Message) => Message) => void;
    flushAll: (sid: string) => void;
  };
  viewed: (sid: string) => boolean;
  controller: AbortController;
  stream: { sessionId: string };
  invalidateSidebar?: boolean;
  reportError?: boolean;
}

function parentSessionForEvent(
  ctx: StreamHandlerContext,
  chatSessionId: string,
  event: Record<string, unknown>,
): string | null {
  const stored =
    ctx.parentClaudeBySessionRef.current[chatSessionId] ??
    ctx.sessions.find((item) => item.id === chatSessionId)?.claudeSessionId ??
    null;
  const next = adoptParentClaudeSessionId(stored, event);
  if (next) ctx.parentClaudeBySessionRef.current[chatSessionId] = next;
  return next;
}

export function createChatStreamHandlers(ctx: StreamHandlerContext): ChatStreamHandlers {
  return {
    onSession: (nextSession) => {
      if (!ctx.mountedRef.current) return;
      const previousId = ctx.stream.sessionId;
      const switched = nextSession.id !== previousId;
      if (switched) {
        if (ctx.abortBySessionRef.current.get(previousId) === ctx.controller) {
          ctx.abortBySessionRef.current.delete(previousId);
        }
        ctx.abortBySessionRef.current.set(nextSession.id, ctx.controller);
        ctx.sendingSessionsRef.current.delete(previousId);
        ctx.sendingSessionsRef.current.add(nextSession.id);
        ctx.setSendingSessionIds((prev) => {
          const without = prev.filter((id) => id !== previousId);
          return without.includes(nextSession.id) ? without : [...without, nextSession.id];
        });
        ctx.stream.sessionId = nextSession.id;
        ctx.sessionIdRef.current = nextSession.id;
        ctx.setSessionId(nextSession.id);
      }
      upsertAgentSession(ctx.queryClient, ctx.agentId, nextSession, { activate: switched });
      ctx.queryClient.invalidateQueries({ queryKey: ['agent', ctx.agentId] });
      if (ctx.invalidateSidebar) {
        ctx.queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      }
    },
    onUserMessage: (message) => {
      if (!ctx.mountedRef.current) return;
      setMessagesCache(ctx.queryClient, ctx.agentId, ctx.stream.sessionId, (prev) =>
        upsertMessage(prev, message),
      );
    },
    onAssistantMessage: (message) => {
      if (!ctx.mountedRef.current) return;
      setMessagesCache(ctx.queryClient, ctx.agentId, ctx.stream.sessionId, (prev) =>
        upsertMessage(prev, message),
      );
    },
    onToken: (token) => {
      if (!ctx.mountedRef.current) return;
      ctx.streamingPatches.appendToken(ctx.stream.sessionId, token);
    },
    onEvent: (event) => {
      if (!ctx.mountedRef.current) return;
      const parentSessionId = parentSessionForEvent(ctx, ctx.stream.sessionId, event);
      ctx.streamingPatches.patchStreaming(ctx.stream.sessionId, (message) =>
        applyEventToAssistant(message, event, parentSessionId),
      );
    },
    onPermissionRequest: (request) => {
      if (!ctx.mountedRef.current || !ctx.viewed(ctx.stream.sessionId)) return;
      ctx.setPermissionRequests((prev) => {
        if (prev.some((item) => item.requestId === request.requestId)) return prev;
        return [...prev, request];
      });
    },
    onDone: (payload) => {
      if (!ctx.mountedRef.current) return;
      const sid = payload.chatSessionId ?? ctx.stream.sessionId;
      ctx.streamingPatches.flushAll(sid);
      void ctx.queryClient.cancelQueries({ queryKey: ['messages', ctx.agentId, sid] });
      setMessagesCache(ctx.queryClient, ctx.agentId, sid, (prev) =>
        upsertMessage(prev, payload.message),
      );
      void ctx.queryClient
        .invalidateQueries({ queryKey: ['permissions', ctx.agentId, sid] })
        .then(() => api.listPendingPermissions(ctx.agentId, sid))
        .then((pending) => {
          if (ctx.mountedRef.current && ctx.viewed(sid)) ctx.setPermissionRequests(pending);
        })
        .catch(() => {
          if (ctx.mountedRef.current && ctx.viewed(sid)) ctx.setPermissionRequests([]);
        });
      ctx.queryClient.invalidateQueries({ queryKey: ['messages', ctx.agentId, sid] });
      ctx.queryClient.invalidateQueries({ queryKey: ['agent', ctx.agentId] });
      ctx.queryClient.invalidateQueries({ queryKey: ['events', ctx.agentId] });
      ctx.queryClient.invalidateQueries({ queryKey: ['diff', ctx.agentId] });
      if (ctx.invalidateSidebar) {
        ctx.queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      }
      ctx.queryClient.invalidateQueries({ queryKey: ['queue', ctx.agentId, sid] });
    },
    onError: (err) => {
      if (!ctx.mountedRef.current) return;
      if (ctx.reportError !== false && ctx.viewed(ctx.stream.sessionId)) ctx.setChatError(err);
      ctx.queryClient.invalidateQueries({
        queryKey: ['messages', ctx.agentId, ctx.stream.sessionId],
      });
      ctx.queryClient.invalidateQueries({ queryKey: ['agent', ctx.agentId] });
    },
  };
}
