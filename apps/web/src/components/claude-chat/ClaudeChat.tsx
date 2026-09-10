import { Box } from '@mui/material';
import { ChatBubble } from './ChatBubble';
import { ClaudeComposer } from './composer/ClaudeComposer';
import { ClaudeTranscript } from './ClaudeTranscript';
import { CompactContinueBanner } from './CompactContinueBanner';
import { DefaultPermissionCard } from './DefaultPermissionCard';
import { MessageTimeline } from './MessageTimeline';
import { CHAT_COLUMN_MAX_WIDTH } from './ChatTranscriptList';
import { useChatScroll } from './chatScroll';
import type { ChatTurn, ClaudeChatProps, PermissionPrompt } from './types';

export function ClaudeChat({
  messages,
  items,
  pendingPermissions = [],
  status = 'idle',
  contextUsage,
  onCompact,
  compacting,
  composer,
  slots,
  renderPermission,
  renderBlock,
  renderTurn,
  renderSessionBreak,
  loading,
  error,
  onRewindMessage,
  onRetry,
  highlightPermissions,
  permissionBusy,
  onAllowPermission,
  onDenyPermission,
  onAnswerQuestions,
  onSkipQuestions,
  planFollowUps,
  planFollowUpsLoading,
  onSelectPlanFollowUp,
  onApprovePlan,
  scroll,
}: ClaudeChatProps & { scroll?: ReturnType<typeof useChatScroll> }) {
  const streaming = status === 'streaming';

  const renderPermissionRequest = (prompt: PermissionPrompt) => {
    const defaultEl = (
      <DefaultPermissionCard
        prompt={prompt}
        busy={permissionBusy}
        highlight={highlightPermissions}
        onAllow={onAllowPermission}
        onDeny={onDenyPermission}
        onAnswer={onAnswerQuestions}
        onSkip={onSkipQuestions}
        planFollowUps={planFollowUps}
        planFollowUpsLoading={planFollowUpsLoading}
        onSelectPlanFollowUp={onSelectPlanFollowUp}
        onApprovePlan={onApprovePlan}
      />
    );
    return renderPermission ? renderPermission(prompt, defaultEl) : defaultEl;
  };

  const renderMessage = (turn: ChatTurn, index: number) => {
    const defaultEl =
      turn.role === 'assistant' ? (
        <MessageTimeline turn={turn} renderBlock={renderBlock} onRetry={onRetry ? () => onRetry(turn) : undefined} />
      ) : (
        <ChatBubble
          turn={turn}
          onCopy={() => void navigator.clipboard.writeText(turn.content ?? '')}
          onRewind={onRewindMessage ? () => onRewindMessage(turn) : undefined}
          onRetry={onRetry ? () => onRetry(turn) : undefined}
        />
      );
    return renderTurn ? renderTurn(turn, index, defaultEl) : defaultEl;
  };

  const showFooter = Boolean(
    slots?.footer || slots?.composer || composer || slots?.banners || (contextUsage && onCompact),
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
      {slots?.header}
      <ClaudeTranscript
        messages={messages}
        items={items}
        permissionRequests={pendingPermissions}
        loading={loading}
        error={error}
        emptyState={slots?.emptyState}
        renderMessage={renderMessage}
        renderSessionBreak={renderSessionBreak}
        renderPermissionRequest={renderPermissionRequest}
        scroll={scroll}
      />
      {showFooter
        ? (slots?.footer ?? (
            <Box
              sx={{
                flexShrink: 0,
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: 'ao.surface.panel',
                backdropFilter: 'blur(12px)',
              }}
            >
              <Box
                sx={{
                  maxWidth: CHAT_COLUMN_MAX_WIDTH,
                  mx: 'auto',
                  px: { xs: 1.25, sm: 2.5 },
                  py: { xs: 1.25, sm: 1.5 },
                }}
              >
                {slots?.banners}
                {contextUsage && onCompact ? (
                  <CompactContinueBanner usage={contextUsage} compacting={compacting} onCompact={onCompact} />
                ) : null}
                {slots?.composer ??
                  (composer ? (
                    <ClaudeComposer
                      config={composer}
                      streaming={streaming}
                      leading={slots?.composerLeading}
                      trailing={slots?.composerTrailing}
                    />
                  ) : null)}
              </Box>
            </Box>
          ))
        : null}
    </Box>
  );
}
