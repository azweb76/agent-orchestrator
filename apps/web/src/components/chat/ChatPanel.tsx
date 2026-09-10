import { memo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ChatSessionTemplateId } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import type { AgentAttentionFocus } from '../../notifications';
import { ChatPanelView } from './ChatPanelView';
import type { PendingImage } from './composerTypes';
import type { PendingMention } from './mentionComposer';
import { useChatScroll } from './chatScroll';
import { useChatAbortRegistry } from './useChatAbortRegistry';
import { useChatPanelRenderers } from './useChatPanelRenderers';
import { useChatPermissions } from './useChatPermissions';
import { useChatSessionActions } from './useChatSessionActions';
import { useChatStreaming } from './useChatStreaming';
import { useChatTemplateKickoff, type ChatTemplateKickoffRequest } from './useChatTemplateKickoff';
import { useChatAttentionFocus } from './useChatAttentionFocus';
import { useChatPanelSessionEffects } from './useChatPanelSessionEffects';
import { useChatPlanFollowUps } from './useChatPlanFollowUps';
import { useChatTranscript } from './useChatTranscript';
import { transcriptIndexForSession } from './buildChatTranscriptItems';

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
  /** Agent PR strip / header kickoff (new session each nonce). */
  templateKickoff?: ChatTemplateKickoffRequest | null;
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
  templateKickoff = null,
}: ChatPanelProps) {
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
      worktree: data.worktree,
      prStatus: data.prStatus ?? null,
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

  const transcript = useChatTranscript({
    agentId,
    sessions,
    activeSessionId,
    active,
    sendingSessionsRef: abortRegistry.sendingSessionsRef,
    followingRef: abortRegistry.followingRef,
  });
  const {
    activeMessages,
    allMessages,
    transcriptItems,
    priorUserByIndex,
    priorUserById,
  } = transcript;
  const hasStreamingMessage = activeMessages.some((m) => m.metadata?.streaming);
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
    messageCount: transcriptItems.length,
    permissionCount: permissions.permissionRequests.length,
    messagesLoading: transcript.isLoading,
  });

  const scrollToSession = (sessionId: string) => {
    const index = transcriptIndexForSession(transcriptItems, sessionId);
    if (index < 0) return;
    scroll.stickToBottomRef.current = false;
    scroll.transcriptRef.current?.scrollToIndex(index);
  };

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
    messagesLoading: transcript.isLoading,
    messagesData: activeMessages,
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
    stickToBottom: scroll.stickToBottom,
    runChatRef: streaming.runChatRef,
  });

  useChatPanelSessionEffects({
    mountedRef,
    activeSessionId,
    setChatError,
    setLastFailed,
    awaitingPermissionFocus: permissions.awaitingPermissionFocus,
    permissionCount: permissions.permissionRequests.length,
    permissionsFetched: permissions.pendingPermissionsQuery.isFetched,
    setAwaitingPermissionFocus: permissions.setAwaitingPermissionFocus,
  });

  useChatAttentionFocus({
    focusAttention,
    focusSessionId,
    sessionIdRef,
    selectSession: sessionActions.selectSession,
    setAwaitingPermissionFocus: permissions.setAwaitingPermissionFocus,
    setFocusPermissions,
    scrollToBottom: () => scroll.transcriptRef.current?.scrollToBottom(),
    scrollToSession,
    stickToBottomRef: scroll.stickToBottomRef,
    setShowJumpToLatest: scroll.setShowJumpToLatest,
  });

  useChatTemplateKickoff({
    archived,
    initialTemplate,
    requested: templateKickoff,
    createFromTemplateId: sessionActions.createFromTemplateId,
  });

  const handlePermissionError = (message: string) => setChatError(message);
  const abortSession = (sid: string) => abortRegistry.abortBySessionRef.current.get(sid)?.abort();

  const planFollowUps = useChatPlanFollowUps({
    active,
    archived,
    permissionRequests: permissions.permissionRequests,
    buildPlan: streaming.buildPlan,
    setPermissionBusy: permissions.setPermissionBusy,
    keepPlanning: permissions.keepPlanning,
    abortSession,
    onError: handlePermissionError,
  });

  const { renderPermissionRequest } = useChatPanelRenderers({
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
    abortSession,
    allowTool: permissions.allowTool,
    denyTool: permissions.denyTool,
    requestRewind: sessionActions.requestRewind,
    runChat: streaming.runChat,
  });

  return (
    <ChatPanelView
      agentId={agentId}
      archived={archived}
      sessions={sessions}
      session={session}
      activeSessionId={activeSessionId}
      agentDefaults={agentDefaults}
      sessionBusy={sessionBusy}
      transcriptItems={transcriptItems}
      allMessages={allMessages}
      activeMessages={activeMessages}
      priorUserById={priorUserById}
      lastFailed={lastFailed}
      chatError={chatError}
      draft={draft}
      setDraft={setDraft}
      setChatError={setChatError}
      loading={transcript.isLoading}
      error={transcript.error ? transcript.error.message : null}
      scroll={scroll}
      scrollToSession={scrollToSession}
      focusPermissions={focusPermissions}
      permissionBusy={permissions.permissionBusy}
      permissionRequests={permissions.permissionRequests}
      renderPermissionRequest={renderPermissionRequest}
      planFollowUps={planFollowUps}
      sessionActions={sessionActions}
      streaming={streaming}
    />
  );
});
