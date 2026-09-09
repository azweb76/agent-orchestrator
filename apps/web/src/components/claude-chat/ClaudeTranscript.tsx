import type { ReactNode } from 'react';
import { Alert, Box, CircularProgress, Fab } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { ControlTooltip } from '../ui/ControlTooltip';
import { ChatTranscriptList, CHAT_COLUMN_MAX_WIDTH } from './ChatTranscriptList';
import { useChatScroll } from './chatScroll';
import type { ChatTurn, PermissionPrompt } from './types';

export function ClaudeTranscript({
  messages,
  permissionRequests,
  loading,
  error,
  emptyState,
  renderMessage,
  renderPermissionRequest,
  scroll: scrollProp,
}: {
  messages: ChatTurn[];
  permissionRequests: PermissionPrompt[];
  loading?: boolean;
  error?: string | null;
  emptyState?: ReactNode;
  renderMessage: (turn: ChatTurn, index: number) => ReactNode;
  renderPermissionRequest: (prompt: PermissionPrompt) => ReactNode;
  scroll?: ReturnType<typeof useChatScroll>;
}) {
  const internalScroll = useChatScroll('session', 'chat', {
    messageCount: messages.length,
    permissionCount: permissionRequests.length,
    messagesLoading: Boolean(loading),
  });
  const scroll = scrollProp ?? internalScroll;

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      ) : messages.length === 0 ? (
        <Box
          ref={scroll.chatScrollRef}
          onScroll={scroll.handleChatScroll}
          sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
        >
          <Box
            sx={{
              maxWidth: CHAT_COLUMN_MAX_WIDTH,
              mx: 'auto',
              px: { xs: 1.5, sm: 2.5 },
              py: { xs: 1.5, sm: 2 },
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
              {emptyState}
            </Box>
            {permissionRequests.map((request) => renderPermissionRequest(request))}
            <Box ref={scroll.bottomSentinelRef} sx={{ height: 1, width: '100%' }} aria-hidden />
          </Box>
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ChatTranscriptList
            ref={scroll.transcriptRef}
            messages={messages}
            permissionRequests={permissionRequests}
            scrollerRef={scroll.assignChatScrollerRef}
            bottomSentinelRef={scroll.bottomSentinelRef}
            stickToBottomRef={scroll.stickToBottomRef}
            onShowJumpToLatestChange={scroll.setShowJumpToLatest}
            onScroll={scroll.handleChatScroll}
            renderMessage={renderMessage}
            renderPermissionRequest={renderPermissionRequest}
          />
        </Box>
      )}

      {scroll.showJumpToLatest ? (
        <ControlTooltip title="Jump to latest">
          <Fab
            size="small"
            color="primary"
            onClick={scroll.jumpToLatest}
            aria-label="Jump to latest messages"
            sx={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2,
              color: 'ao.action.onAccent',
            }}
          >
            <KeyboardArrowDownIcon />
          </Fab>
        </ControlTooltip>
      ) : null}
    </Box>
  );
}
