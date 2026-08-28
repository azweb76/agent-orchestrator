import type { ReactNode } from 'react';
import { Alert, Box, Chip, CircularProgress, Fab, Stack } from '@mui/material';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { Message, PermissionRequest } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { ChatTranscriptList, CHAT_COLUMN_MAX_WIDTH } from './ChatTranscriptList';
import { CONTEXT_SLASH_CHIP_COMMANDS } from './slashComposer';
import type { useChatScroll } from './chatScroll';

interface ChatPanelTranscriptProps {
  messagesLoading: boolean;
  messagesError: unknown;
  displayMessages: Message[];
  permissionRequests: PermissionRequest[];
  scroll: ReturnType<typeof useChatScroll>;
  renderMessage: (message: Message, index: number) => ReactNode;
  renderPermissionRequest: (request: PermissionRequest) => ReactNode;
  onSlashCommand: (command: string) => void;
}

export function ChatPanelTranscript({
  messagesLoading,
  messagesError,
  displayMessages,
  permissionRequests,
  scroll,
  renderMessage,
  renderPermissionRequest,
  onSlashCommand,
}: ChatPanelTranscriptProps) {
  const {
    chatScrollRef,
    transcriptRef,
    bottomSentinelRef,
    stickToBottomRef,
    showJumpToLatest,
    handleChatScroll,
    assignChatScrollerRef,
    jumpToLatest,
  } = scroll;

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {messagesLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : messagesError ? (
        <Alert severity="error" sx={{ m: 2 }}>
          {(messagesError as Error).message}
        </Alert>
      ) : displayMessages.length === 0 ? (
        <Box
          ref={chatScrollRef}
          onScroll={handleChatScroll}
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
              <EmptyState
                compact
                icon={<ChatOutlinedIcon />}
                title="Start a conversation"
                description="Sessions begin in plan mode. Describe what you want; Claude will explore, ask clarifying questions, and present a plan. Use + to start a Review or Create draft PR session in parallel. Type / for commands, /clear to reset this session, or /rewind to restore the last prompt."
                action={
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                    {CONTEXT_SLASH_CHIP_COMMANDS.map((command) => (
                      <Chip
                        key={command}
                        size="small"
                        label={command}
                        variant="outlined"
                        clickable
                        onClick={() => onSlashCommand(command)}
                        sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                      />
                    ))}
                  </Stack>
                }
              />
            </Box>
            {permissionRequests.map((request) => renderPermissionRequest(request))}
            <Box ref={bottomSentinelRef} sx={{ height: 1, width: '100%' }} aria-hidden />
          </Box>
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ChatTranscriptList
            ref={transcriptRef}
            messages={displayMessages}
            permissionRequests={permissionRequests}
            scrollerRef={assignChatScrollerRef}
            bottomSentinelRef={bottomSentinelRef}
            stickToBottomRef={stickToBottomRef}
            onShowJumpToLatestChange={scroll.setShowJumpToLatest}
            onScroll={handleChatScroll}
            renderMessage={renderMessage}
            renderPermissionRequest={renderPermissionRequest}
          />
        </Box>
      )}

      {showJumpToLatest ? (
        <ControlTooltip title="Jump to latest">
          <Fab
            size="small"
            color="primary"
            onClick={jumpToLatest}
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
