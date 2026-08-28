import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  chatSessionTemplateById,
  type AgentDetail,
  type ChatSession,
  type ChatSessionTemplate,
  type Message,
  type UpdateChatSessionRequest,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { setMessagesCache, upsertAgentSession } from './chatQueryCache';

interface UseChatSessionActionsOptions {
  agentId: string;
  activeSessionId: string;
  archived: boolean;
  sessionBusy: boolean;
  sessionIdRef: React.MutableRefObject<string>;
  setSessionId: (id: string) => void;
  mountedRef: React.MutableRefObject<boolean>;
  setChatError: React.Dispatch<React.SetStateAction<string | null>>;
  setPermissionRequests: React.Dispatch<React.SetStateAction<import('@agent-orchestrator/shared').PermissionRequest[]>>;
  setLastFailed: React.Dispatch<
    React.SetStateAction<{
      text: string;
      images: import('./composerTypes').PendingImage[];
      mentions: import('./mentionComposer').PendingMention[];
    } | null>
  >;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  runChatRef: React.MutableRefObject<
    (
      text: string,
      images: import('./composerTypes').PendingImage[],
      mentions: import('./mentionComposer').PendingMention[],
      force: boolean,
      sessionId?: string,
    ) => Promise<void>
  >;
}

export function useChatSessionActions({
  agentId,
  activeSessionId,
  archived,
  sessionBusy,
  sessionIdRef,
  setSessionId,
  mountedRef,
  setChatError,
  setPermissionRequests,
  setLastFailed,
  setDraft,
  runChatRef,
}: UseChatSessionActionsOptions) {
  const queryClient = useQueryClient();
  const activationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestActivationRef = useRef(0);
  const [creatingSession, setCreatingSession] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [improveOpen, setImproveOpen] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (body: UpdateChatSessionRequest) =>
      api.updateSession(agentId, activeSessionId, body),
    onSuccess: (updated) => {
      upsertAgentSession(queryClient, agentId, updated);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const renameSessionMutation = useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      api.updateSession(agentId, sessionId, { title }),
    onMutate: ({ sessionId, title }) => {
      queryClient.setQueryData<AgentDetail>(['agent', agentId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: (prev.sessions ?? []).map((item) =>
            item.id === sessionId ? { ...item, title, titleSource: 'user' } : item,
          ),
        };
      });
    },
    onSuccess: (updated) => {
      upsertAgentSession(queryClient, agentId, updated);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
    onError: (error) => {
      setChatError((error as Error).message);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearMessages(agentId, activeSessionId),
    onSuccess: () => {
      setClearOpen(false);
      setPermissionRequests([]);
      setChatError(null);
      setLastFailed(null);
      setMessagesCache(queryClient, agentId, activeSessionId, () => []);
      queryClient.invalidateQueries({ queryKey: ['queue', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['messages', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const rewindMutation = useMutation({
    mutationFn: (messageId: string) => api.rewindMessages(agentId, activeSessionId, messageId),
    onSuccess: (result, messageId) => {
      setRewindTarget(null);
      setPermissionRequests([]);
      setChatError(null);
      setLastFailed(null);
      setDraft(result.draft);
      setMessagesCache(queryClient, agentId, activeSessionId, (prev) => {
        if (!prev?.length) return [];
        const index = prev.findIndex((item) => item.id === messageId);
        if (index < 0) return prev;
        return prev.slice(0, index);
      });
      queryClient.invalidateQueries({ queryKey: ['queue', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['messages', agentId, activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (target: ChatSession) => api.deleteSession(agentId, target.id),
    onSuccess: (detail, target) => {
      setDeleteTarget(null);
      setPermissionRequests([]);
      setChatError(null);
      setLastFailed(null);
      const nextId = detail.activeSessionId ?? detail.sessions[0]?.id ?? '';
      sessionIdRef.current = nextId;
      setSessionId(nextId);
      queryClient.setQueryData(['agent', agentId], detail);
      queryClient.removeQueries({ queryKey: ['messages', agentId, target.id] });
      queryClient.removeQueries({ queryKey: ['permissions', agentId, target.id] });
      queryClient.removeQueries({ queryKey: ['queue', agentId, target.id] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  const gradeMutation = useMutation({
    mutationFn: (body: { notes?: string } = {}) => api.gradeSession(agentId, activeSessionId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const selectSession = async (id: string) => {
    if (id === activeSessionId) return;
    setSessionId(id);
    sessionIdRef.current = id;
    latestActivationRef.current += 1;
    const activation = latestActivationRef.current;
    const request = activationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const detail = await api.activateSession(agentId, id);
        if (!mountedRef.current || activation !== latestActivationRef.current) return;
        queryClient.setQueryData(['agent', agentId], detail);
      });
    activationQueueRef.current = request;
    try {
      await request;
    } catch (error) {
      if (mountedRef.current && activation === latestActivationRef.current) {
        setChatError((error as Error).message);
      }
    }
  };

  const createSessionFromTemplate = async (template: ChatSessionTemplate) => {
    if (archived) return;
    setCreatingSession(true);
    setChatError(null);
    try {
      const result = await api.createSession(agentId, { template: template.id });
      upsertAgentSession(queryClient, agentId, result.session, { activate: true });
      sessionIdRef.current = result.session.id;
      setSessionId(result.session.id);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      if (result.kickoffPrompt) {
        void runChatRef.current(result.kickoffPrompt, [], [], false, result.session.id);
      }
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setCreatingSession(false);
    }
  };

  const requestClear = () => setClearOpen(true);

  const requestRewind = (message: Message) => {
    if (archived || sessionBusy) return;
    setRewindTarget(message);
  };

  const requestRewindLast = (displayMessages: Message[]) => {
    const lastUser = [...displayMessages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      setChatError('Nothing to rewind — send a message first.');
      return;
    }
    requestRewind(lastUser);
  };

  const createFromTemplateId = (templateId: string) => {
    const template = chatSessionTemplateById(templateId);
    if (template) void createSessionFromTemplate(template);
  };

  return {
    creatingSession,
    clearOpen,
    setClearOpen,
    rewindTarget,
    setRewindTarget,
    deleteTarget,
    setDeleteTarget,
    gradeOpen,
    setGradeOpen,
    improveOpen,
    setImproveOpen,
    updateMutation,
    renameSessionMutation,
    clearMutation,
    rewindMutation,
    deleteSessionMutation,
    gradeMutation,
    selectSession,
    createSessionFromTemplate,
    createFromTemplateId,
    requestClear,
    requestRewind,
    requestRewindLast,
  };
}
