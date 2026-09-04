import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHAT_SESSION_TEMPLATES,
  mergeChatMessages,
  type ChatSessionTemplateId,
  type EffortLevel,
  type Message,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { useSseConnectionState } from '../../api/events';
import { SSE_FALLBACK_ACTIVE_POLL_MS } from '../../api/ssePolling';
import type { AgentAttentionFocus } from '../../notifications';
import { ChatPanelDialogs } from './ChatPanelDialogs';
import { ChatPanelFooter } from './ChatPanelFooter';
import { ChatPanelTranscript } from './ChatPanelTranscript';
import { ChatSessionBar } from './ChatSessionBar';
import type { PendingImage } from './composerTypes';
import type { PendingMention } from './mentionComposer';
import { useChatScroll } from './chatScroll';
import { useChatAbortRegistry } from './useChatAbortRegistry';
import { useChatPanelRenderers } from './useChatPanelRenderers';
import { useChatPermissions } from './useChatPermissions';
import { useChatSessionActions } from './useChatSessionActions';
import { useChatStreaming } from './useChatStreaming';
import { resolveTaskSuggestionAction } from './taskSuggestionActions';

interface ChatPanelProps {
  agentId: string;
  archived: boolean;
  active?: boolean;
  initialPrompt?: string;
  initialImages?: PendingImage[];
  initialMentions?: PendingMention[];
  initialTemplate?: ChatSessionTemplateId;
  focusAttention?: AgentAttentionFocus;
  focusSessionId?: string;
  /** Opens the commit dialog (Commit and Push follow-up chip). */
  onCommitAndPush?: () => void;
}

export const ChatPanel = memo(function ChatPanel({
  agentId,
  archived,
  active = true,
  initialPrompt,
  initialImages,
  initialMentions,
  initialTemplate,
  focusAttention,
  focusSessionId,
  onCommitAndPush,
}: ChatPanelProps) {
  const sseState = useSseConnectionState();
  const queryClient = useQueryClient();
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);

  const agentDetailQuery = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.getAgent(agentId),
    select: (data) => ({
      sessions: data.sessions ?? [],
      activeSessionId: data.activeSessionId,
      model: data.model,
      effort: data.effort,
      permissionMode: data.permissionMode ?? 'plan',
      draftPrOffer: data.draftPrOffer ?? null,
      taskSuggestions: data.taskSuggestions ?? null,
      instructionDraftOffer: data.instructionDraftOffer ?? null,
    }),
  });

  const sessions = agentDetailQuery.data?.sessions ?? [];
  const agentDefaults = agentDetailQuery.data;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const resolvedSessionId =
    sessionId ?? agentDefaults?.activeSessionId ?? agentDefaults?.sessions[0]?.id ?? '';
  const session = sessions.find((item) => item.id === resolvedSessionId) ?? sessions[0];
  const activeSessionId = session?.id ?? resolvedSessionId;
  const sessionIdRef = useRef(activeSessionId);
  sessionIdRef.current = activeSessionId;

  const [draft, setDraft] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<{
    text: string;
    images: PendingImage[];
    mentions: PendingMention[];
  } | null>(null);
  const [focusPermissions, setFocusPermissions] = useState(
    () => focusAttention === 'needs-input',
  );

  const abortRegistry = useChatAbortRegistry();
  const isSending = abortRegistry.sendingSessionIds.includes(activeSessionId);

  const messagesQuery = useQuery({
    queryKey: ['messages', agentId, activeSessionId],
    queryFn: async () => {
      const remote = await api.getMessages(agentId, activeSessionId);
      const local = queryClient.getQueryData<Message[]>(['messages', agentId, activeSessionId]);
      return mergeChatMessages(local, remote);
    },
    enabled: active && Boolean(activeSessionId),
    refetchOnWindowFocus: true,
    refetchInterval: () => {
      if (!active) return false;
      if (sseState === 'connected') return false;
      if (abortRegistry.sendingSessionsRef.current.has(activeSessionId)) return false;
      if (abortRegistry.followingRef.current.has(activeSessionId)) return false;
      const cached = queryClient.getQueryData<Message[]>(['messages', agentId, activeSessionId]);
      const streaming = cached?.some((item) => item.metadata?.streaming);
      if (session?.status === 'running' || streaming) {
        return SSE_FALLBACK_ACTIVE_POLL_MS;
      }
      return false;
    },
  });

  const displayMessages = messagesQuery.data ?? [];
  const hasStreamingMessage = displayMessages.some((m) => m.metadata?.streaming);
  const sessionBusy = session?.status === 'running' || isSending || hasStreamingMessage;

  const permissions = useChatPermissions({
    agentId,
    activeSessionId,
    active,
    sessionBusy,
    isSending,
    sessionIdRef,
  });

  const scroll = useChatScroll(activeSessionId, agentId, {
    messageCount: displayMessages.length,
    permissionCount: permissions.permissionRequests.length,
    messagesLoading: messagesQuery.isLoading,
  });

  const streaming = useChatStreaming({
    agentId,
    activeSessionId,
    active,
    archived,
    session,
    sessions,
    sessionIdRef,
    setSessionId,
    mountedRef,
    isSending,
    abortRegistry,
    setChatError,
    setPermissionRequests: permissions.setPermissionRequests,
    setLastFailed,
    stickToBottom: scroll.stickToBottom,
    initialPrompt,
    initialImages,
    initialMentions,
    autoStartedRef,
    messagesLoading: messagesQuery.isLoading,
    messagesData: messagesQuery.data,
  });

  const sessionActions = useChatSessionActions({
    agentId,
    activeSessionId,
    archived,
    sessionBusy,
    sessionIdRef,
    setSessionId,
    mountedRef,
    setChatError,
    setPermissionRequests: permissions.setPermissionRequests,
    setLastFailed,
    setDraft,
    runChatRef: streaming.runChatRef,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setChatError(null);
    setLastFailed(null);
  }, [activeSessionId]);

  useEffect(() => {
    if (!permissions.awaitingPermissionFocus) return;
    if (permissions.permissionRequests.length > 0 || permissions.pendingPermissionsQuery.isFetched) {
      permissions.setAwaitingPermissionFocus(false);
    }
  }, [
    permissions.awaitingPermissionFocus,
    permissions.permissionRequests.length,
    permissions.pendingPermissionsQuery.isFetched,
    permissions.setAwaitingPermissionFocus,
  ]);

  useEffect(() => {
    if (!focusAttention) return;
    let cancelled = false;

    const revealAttention = () => {
      requestAnimationFrame(() => {
        scroll.transcriptRef.current?.scrollToBottom();
        scroll.stickToBottomRef.current = false;
        scroll.setShowJumpToLatest(true);
      });
    };

    const run = async () => {
      if (focusSessionId && focusSessionId !== sessionIdRef.current) {
        await sessionActions.selectSession(focusSessionId);
        if (cancelled) return;
      }
      if (focusAttention === 'needs-input') {
        permissions.setAwaitingPermissionFocus(true);
        setFocusPermissions(true);
        window.setTimeout(() => setFocusPermissions(false), 4000);
      }
      revealAttention();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [focusAttention, focusSessionId]);

  useEffect(() => {
    if (!initialTemplate || archived || autoStartedRef.current) return;
    autoStartedRef.current = true;
    sessionActions.createFromTemplateId(initialTemplate);
  }, [archived, initialTemplate]);

  const priorUserByIndex = useMemo(() => {
    const map = new Map<number, Message | undefined>();
    let lastUser: Message | undefined;
    for (let index = 0; index < displayMessages.length; index += 1) {
      map.set(index, lastUser);
      const message = displayMessages[index];
      if (message?.role === 'user') lastUser = message;
    }
    return map;
  }, [displayMessages]);

  const handlePermissionError = (message: string) => setChatError(message);

  const { renderPermissionRequest, renderMessage } = useChatPanelRenderers({
    archived,
    focusPermissions,
    permissionBusy: permissions.permissionBusy,
    permissionRequests: permissions.permissionRequests,
    lastFailed,
    priorUserByIndex,
    onPermissionError: handlePermissionError,
    submitAnswers: permissions.submitAnswers,
    skipAskUserQuestion: permissions.skipAskUserQuestion,
    buildPlan: streaming.buildPlan,
    setPermissionBusy: permissions.setPermissionBusy,
    keepPlanning: permissions.keepPlanning,
    abortSession: (sid) => abortRegistry.abortBySessionRef.current.get(sid)?.abort(),
    allowTool: permissions.allowTool,
    denyTool: permissions.denyTool,
    requestRewind: sessionActions.requestRewind,
    runChat: streaming.runChat,
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      <ChatSessionBar
        sessions={sessions}
        activeSessionId={activeSessionId || null}
        disabled={archived}
        creating={sessionActions.creatingSession}
        onSelect={(id) => void sessionActions.selectSession(id)}
        onCreate={(template) => void sessionActions.createSessionFromTemplate(template)}
        onCreateTask={(task) => void sessionActions.createSessionFromTask(task.name)}
        onDelete={archived ? undefined : (target) => sessionActions.setDeleteTarget(target)}
        onRename={
          archived
            ? undefined
            : (target, title) =>
                sessionActions.renameSessionMutation.mutate({ sessionId: target.id, title })
        }
      />

      <ChatPanelTranscript
        messagesLoading={messagesQuery.isLoading}
        messagesError={messagesQuery.error}
        displayMessages={displayMessages}
        permissionRequests={permissions.permissionRequests}
        scroll={scroll}
        renderMessage={renderMessage}
        renderPermissionRequest={renderPermissionRequest}
        onSlashCommand={(command) => void streaming.runChatRef.current(command, [], [], false)}
      />

      <ChatPanelFooter
        agentId={agentId}
        agent={
          agentDefaults
            ? {
                draftPrOffer: agentDefaults.draftPrOffer,
                taskSuggestions: agentDefaults.taskSuggestions,
                instructionDraftOffer: agentDefaults.instructionDraftOffer,
              }
            : undefined
        }
        archived={archived}
        activeSessionId={activeSessionId}
        session={session}
        agentDefaults={agentDefaults}
        sessionBusy={sessionBusy}
        stoppedSessionId={streaming.stoppedSessionId}
        compacting={streaming.compacting}
        chatError={chatError}
        lastFailed={lastFailed}
        queue={streaming.queue}
        draft={draft}
        displayMessageCount={displayMessages.length}
        clearMutation={sessionActions.clearMutation}
        rewindMutation={sessionActions.rewindMutation}
        deleteSessionMutation={sessionActions.deleteSessionMutation}
        gradeMutation={sessionActions.gradeMutation}
        onDraftChange={setDraft}
        onModelChange={(model) => sessionActions.updateMutation.mutate({ model })}
        onEffortChange={(effort: EffortLevel) => sessionActions.updateMutation.mutate({ effort })}
        onPermissionModeChange={(permissionMode) =>
          sessionActions.updateMutation.mutate({ permissionMode })
        }
        onSend={(text, images, mentions, force) => void streaming.runChat(text, images, mentions, force)}
        onStop={() => void streaming.stopStreaming()}
        onClear={sessionActions.requestClear}
        onRewind={() => sessionActions.requestRewindLast(displayMessages)}
        onGradeOpen={() => {
          sessionActions.gradeMutation.reset();
          sessionActions.setGradeOpen(true);
          if (!session?.grade?.analysis) {
            sessionActions.gradeMutation.mutate({});
          }
        }}
        onImproveOpen={(offer) => {
          if (offer) {
            sessionActions.setImproveSeed({
              kind: offer.kind ?? offer.draft?.kind ?? 'skill',
              scope: offer.scope ?? offer.draft?.scope,
              extraNotes: offer.extraNotes ?? '',
              draft: offer.draft ?? null,
            });
          } else {
            sessionActions.setImproveSeed(null);
          }
          sessionActions.setImproveOpen(true);
        }}
        onCompact={() => void streaming.compactAndContinue()}
        onRemoveQueued={(id) => {
          const sid = activeSessionId;
          void api
            .removeQueuedMessage(agentId, sid, id)
            .catch(() => undefined)
            .finally(() => {
              queryClient.invalidateQueries({ queryKey: ['queue', agentId, sid] });
            });
        }}
        onChatErrorClose={() => setChatError(null)}
        onRetryFailed={() => {
          if (lastFailed) {
            void streaming.runChat(lastFailed.text, lastFailed.images, lastFailed.mentions, true);
          }
        }}
        onCreateDraftPr={() => {
          const template = CHAT_SESSION_TEMPLATES.find((item) => item.id === 'create-draft-pr');
          if (template) void sessionActions.createSessionFromTemplate(template);
        }}
        creatingDraftPr={sessionActions.creatingSession}
        onSelectTaskSuggestion={(suggestion) => {
          const action = resolveTaskSuggestionAction(suggestion);
          if (action.type === 'commit-and-push') {
            onCommitAndPush?.();
            return;
          }
          if (action.type === 'start-template') {
            void sessionActions.createSessionFromTemplate(action.template);
            return;
          }
          void streaming.runChat(action.prompt, [], [], false);
        }}
      />

      <ChatPanelDialogs
        agentId={agentId}
        activeSessionId={activeSessionId}
        session={session}
        sessions={sessions}
        clearOpen={sessionActions.clearOpen}
        rewindTarget={sessionActions.rewindTarget}
        deleteTarget={sessionActions.deleteTarget}
        gradeOpen={sessionActions.gradeOpen}
        improveOpen={sessionActions.improveOpen}
        clearMutation={sessionActions.clearMutation}
        rewindMutation={sessionActions.rewindMutation}
        deleteSessionMutation={sessionActions.deleteSessionMutation}
        gradeMutation={sessionActions.gradeMutation}
        onClearClose={() => sessionActions.setClearOpen(false)}
        onRewindClose={() => sessionActions.setRewindTarget(null)}
        onDeleteClose={() => {
          if (sessionActions.deleteSessionMutation.isPending) return;
          sessionActions.setDeleteTarget(null);
          sessionActions.deleteSessionMutation.reset();
        }}
        onGradeClose={() => {
          sessionActions.setGradeOpen(false);
          sessionActions.gradeMutation.reset();
        }}
        improveSeed={sessionActions.improveSeed}
        onImproveClose={() => {
          sessionActions.setImproveOpen(false);
          sessionActions.setImproveSeed(null);
        }}
        onImproveApplied={() => {
          queryClient.invalidateQueries({ queryKey: ['instruction-files', agentId] });
          queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
        }}
        onImplementFinding={(finding) => {
          void sessionActions.createSessionFromFinding(finding);
        }}
      />
    </Box>
  );
});
