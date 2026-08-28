import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PermissionRequest } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { useSseConnectionState } from '../../api/events';
import { SSE_FALLBACK_ACTIVE_POLL_MS } from '../../api/ssePolling';

interface UseChatPermissionsOptions {
  agentId: string;
  activeSessionId: string;
  active: boolean;
  sessionBusy: boolean;
  isSending: boolean;
  sessionIdRef: React.MutableRefObject<string>;
}

export function useChatPermissions({
  agentId,
  activeSessionId,
  active,
  sessionBusy,
  isSending,
  sessionIdRef,
}: UseChatPermissionsOptions) {
  const queryClient = useQueryClient();
  const sseState = useSseConnectionState();
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [awaitingPermissionFocus, setAwaitingPermissionFocus] = useState(false);

  const pendingPermissionsQuery = useQuery({
    queryKey: ['permissions', agentId, activeSessionId],
    queryFn: () => api.listPendingPermissions(agentId, activeSessionId),
    enabled:
      active &&
      Boolean(activeSessionId) &&
      (sessionBusy || permissionRequests.length > 0 || awaitingPermissionFocus),
    refetchInterval: () => {
      if (!active) return false;
      if (sseState === 'connected') return false;
      return sessionBusy || permissionRequests.length > 0 ? SSE_FALLBACK_ACTIVE_POLL_MS : false;
    },
  });

  useEffect(() => {
    const remote = pendingPermissionsQuery.data;
    if (remote === undefined) return;
    setPermissionRequests((prev) => {
      if (remote.length === 0 && isSending && prev.length > 0) return prev;
      return remote;
    });
  }, [pendingPermissionsQuery.data, isSending]);

  useEffect(() => {
    setPermissionRequests([]);
  }, [activeSessionId]);

  const removePermission = (requestId: string) => {
    setPermissionRequests((prev) => prev.filter((item) => item.requestId !== requestId));
  };

  const submitAnswers = async (
    request: PermissionRequest,
    answers: Record<string, string>,
    response?: string,
    onError?: (message: string) => void,
  ) => {
    setPermissionBusy(true);
    try {
      await api.answerPermission(agentId, sessionIdRef.current, {
        requestId: request.requestId,
        answers,
        response,
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
    } catch (error) {
      onError?.((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const keepPlanning = async (
    request: PermissionRequest,
    abortSession: (sid: string) => void,
    onError?: (message: string) => void,
  ) => {
    setPermissionBusy(true);
    abortSession(sessionIdRef.current);
    try {
      await api.denyPermission(agentId, sessionIdRef.current, {
        requestId: request.requestId,
        message: 'User wants to keep planning. Revise the plan based on further feedback.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['messages', agentId, sessionIdRef.current] });
    } catch (error) {
      onError?.((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const skipAskUserQuestion = async (
    request: PermissionRequest,
    onError?: (message: string) => void,
  ) => {
    setPermissionBusy(true);
    try {
      await api.answerPermission(agentId, sessionIdRef.current, {
        requestId: request.requestId,
        answers: {},
        response:
          'User skipped these questions. Continue with sensible defaults and ask again only if blocked.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
    } catch (error) {
      onError?.((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const allowTool = async (request: PermissionRequest, onError?: (message: string) => void) => {
    setPermissionBusy(true);
    try {
      await api.allowPermission(agentId, sessionIdRef.current, { requestId: request.requestId });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
    } catch (error) {
      onError?.((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  const denyTool = async (request: PermissionRequest, onError?: (message: string) => void) => {
    setPermissionBusy(true);
    try {
      await api.denyPermission(agentId, sessionIdRef.current, {
        requestId: request.requestId,
        message: 'User denied this tool request.',
      });
      removePermission(request.requestId);
      queryClient.invalidateQueries({ queryKey: ['permissions', agentId, sessionIdRef.current] });
    } catch (error) {
      onError?.((error as Error).message);
    } finally {
      setPermissionBusy(false);
    }
  };

  return {
    permissionRequests,
    setPermissionRequests,
    permissionBusy,
    setPermissionBusy,
    awaitingPermissionFocus,
    setAwaitingPermissionFocus,
    pendingPermissionsQuery,
    removePermission,
    submitAnswers,
    keepPlanning,
    skipAskUserQuestion,
    allowTool,
    denyTool,
  };
}
