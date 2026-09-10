import { useMemo, type ReactNode } from 'react';
import { Box } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import {
  type AgentDetail,
  type ChatSession,
  type EffortLevel,
  type Message,
  type PermissionRequest,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ClaudeChat } from '../claude-chat/ClaudeChat';
import type { ChatTranscriptItem } from '../claude-chat/types';
import { useChatScroll } from '../claude-chat/chatScroll';
import { ChatPanelDialogs } from './ChatPanelDialogs';
import { ChatPanelEmptyState } from './ChatPanelEmptyState';
import { ChatPanelFooter } from './ChatPanelFooter';
import { ChatSessionBreak } from './ChatSessionBreak';
import { mapPermissionPrompt } from './mapAgentChatToClaudeChat';
import { resolveTaskSuggestionAction } from './taskSuggestionActions';
import type { useChatSessionActions } from './useChatSessionActions';
import type { useChatStreaming } from './useChatStreaming';
import type { SessionInsightsTab } from './sessionAnalysis';
import type { PendingImage } from './composerTypes';
import type { PendingMention } from './mentionComposer';
import type { useChatPlanFollowUps } from './useChatPlanFollowUps';

type SessionActions = ReturnType<typeof useChatSessionActions>;
type Streaming = ReturnType<typeof useChatStreaming>;

export function ChatPanelView({
  agentId,
  archived,
  sessions,
  session,
  activeSessionId,
  agentDefaults,
  sessionBusy,
  transcriptItems,
  allMessages,
  activeMessages,
  priorUserById,
  lastFailed,
  chatError,
  draft,
  setDraft,
  setChatError,
  loading,
  error,
  scroll,
  scrollToSession,
  focusPermissions,
  permissionBusy,
  permissionRequests,
  renderPermissionRequest,
  planFollowUps,
  sessionActions,
  streaming,
}: {
  agentId: string;
  archived: boolean;
  sessions: ChatSession[];
  session?: ChatSession;
  activeSessionId: string;
  agentDefaults?: Pick<
    AgentDetail,
    | 'model'
    | 'effort'
    | 'permissionMode'
    | 'draftPrOffer'
    | 'taskSuggestions'
    | 'instructionDraftOffer'
  >;
  sessionBusy: boolean;
  transcriptItems: ChatTranscriptItem[];
  allMessages: Message[];
  activeMessages: Message[];
  priorUserById: Map<string, Message | undefined>;
  lastFailed: { text: string; images: PendingImage[]; mentions: PendingMention[] } | null;
  chatError: string | null;
  draft: string;
  setDraft: (value: string) => void;
  setChatError: (value: string | null) => void;
  loading: boolean;
  error: string | null;
  scroll: ReturnType<typeof useChatScroll>;
  scrollToSession: (sessionId: string) => void;
  focusPermissions: boolean;
  permissionBusy: boolean;
  permissionRequests: PermissionRequest[];
  renderPermissionRequest: (request: PermissionRequest) => ReactNode;
  planFollowUps: ReturnType<typeof useChatPlanFollowUps>;
  sessionActions: SessionActions;
  streaming: Streaming;
}) {
  const queryClient = useQueryClient();
  const prompts = useMemo(
    () => permissionRequests.map(mapPermissionPrompt),
    [permissionRequests],
  );

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
      <ClaudeChat
        items={transcriptItems}
        pendingPermissions={prompts}
        status={sessionBusy ? 'streaming' : permissionRequests.length > 0 ? 'awaiting_input' : 'idle'}
        loading={loading}
        error={error}
        scroll={scroll}
        highlightPermissions={focusPermissions}
        permissionBusy={permissionBusy}
        {...planFollowUps}
        renderSessionBreak={(sessionId) => {
          const target = sessions.find((item) => item.id === sessionId);
          if (!target) return null;
          return (
            <ChatSessionBreak
              session={target}
              active={target.id === activeSessionId}
              disabled={archived}
              onSelect={() => {
                void sessionActions.selectSession(target.id);
                scrollToSession(target.id);
              }}
              onRename={
                archived
                  ? undefined
                  : (title) =>
                      sessionActions.renameSessionMutation.mutate({
                        sessionId: target.id,
                        title,
                      })
              }
              onDelete={archived ? undefined : () => sessionActions.setDeleteTarget(target)}
            />
          );
        }}
        onRewindMessage={
          archived
            ? undefined
            : (turn) => {
                const message = allMessages.find((item) => item.id === turn.id);
                if (message) sessionActions.requestRewind(message);
              }
        }
        onRetry={(turn) => {
          if (lastFailed && turn.role !== 'assistant') {
            void streaming.runChat(lastFailed.text, lastFailed.images, lastFailed.mentions, true);
            return;
          }
          const prior = priorUserById.get(turn.id);
          if (prior && prior.attachments.length === 0) {
            void streaming.runChat(prior.content, [], [], true, prior.sessionId);
          }
        }}
        renderPermission={(prompt, defaultEl) => {
          if (prompt.toolName === 'ExitPlanMode') return defaultEl;
          const request = permissionRequests.find((item) => item.requestId === prompt.id);
          return request ? renderPermissionRequest(request) : defaultEl;
        }}
        slots={{
          emptyState: (
            <ChatPanelEmptyState
              onSlashCommand={(command) => void streaming.runChatRef.current(command, [], [], false)}
            />
          ),
          footer: (
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
              displayMessageCount={activeMessages.length}
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
              onSend={(text, images, mentions, force) =>
                void streaming.runChat(text, images, mentions, force)
              }
              onStop={() => void streaming.stopStreaming()}
              onClear={sessionActions.requestClear}
              onRewind={() => sessionActions.requestRewindLast(activeMessages)}
              onGradeOpen={(tab?: SessionInsightsTab) => {
                sessionActions.openInsights(tab ?? 'context', session?.grade);
              }}
              onImproveOpen={(offer) => {
                if (offer) {
                  sessionActions.setImproveSeed({
                    kind: offer.kind ?? offer.draft?.kind ?? 'skill',
                    scope: offer.scope ?? offer.draft?.scope,
                    extraNotes: offer.extraNotes ?? '',
                    draft: offer.draft ?? null,
                    preferredSkillSlug: offer.preferredSkillSlug,
                    metricsComparison: offer.metricsComparison ?? null,
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
              onSelectTaskSuggestion={(suggestion, options) => {
                const action = resolveTaskSuggestionAction(suggestion, options);
                if (action.type === 'new-prompt') {
                  void sessionActions.createSessionFromSuggestion(action);
                  return;
                }
                void streaming.runChat(action.prompt, [], [], false);
              }}
            />
          ),
        }}
      />

      <ChatPanelDialogs
        agentId={agentId}
        activeSessionId={activeSessionId}
        session={session}
        sessions={sessions}
        isStreaming={sessionBusy}
        clearOpen={sessionActions.clearOpen}
        rewindTarget={sessionActions.rewindTarget}
        deleteTarget={sessionActions.deleteTarget}
        gradeOpen={sessionActions.gradeOpen}
        insightsTab={sessionActions.insightsTab}
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
        onInsightsTabChange={sessionActions.setInsightsTab}
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
        onImproveFinding={sessionActions.openImproveFromFinding}
      />
    </Box>
  );
}
