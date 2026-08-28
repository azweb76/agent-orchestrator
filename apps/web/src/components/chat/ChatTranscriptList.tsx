import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from 'react';
import { Box } from '@mui/material';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { Message, PermissionRequest } from '@agent-orchestrator/shared';

export const CHAT_COLUMN_MAX_WIDTH = 780;

/** Distance from the bottom (px) still treated as "stuck" for auto-scroll. */
export const NEAR_BOTTOM_PX = 80;

export type ChatTranscriptHandle = {
  scrollToBottom: () => void;
};

type ChatTranscriptListProps = {
  messages: Message[];
  permissionRequests: PermissionRequest[];
  scrollerRef: (element: HTMLDivElement | null) => void;
  bottomSentinelRef: Ref<HTMLDivElement | null>;
  stickToBottomRef: React.MutableRefObject<boolean>;
  onShowJumpToLatestChange: (show: boolean) => void;
  onScroll: () => void;
  renderMessage: (message: Message, index: number) => ReactNode;
  renderPermissionRequest: (request: PermissionRequest) => ReactNode;
};

/** Extra pixels below the fold so tall permission cards stay scrollable in Virtuoso. */
const PERMISSION_CARD_VIEWPORT_PADDING = 420;

export const ChatTranscriptList = forwardRef<ChatTranscriptHandle, ChatTranscriptListProps>(
  function ChatTranscriptList(
    {
      messages,
      permissionRequests,
      scrollerRef,
      bottomSentinelRef,
      stickToBottomRef,
      onShowJumpToLatestChange,
      onScroll,
      renderMessage,
      renderPermissionRequest,
    },
    ref,
  ) {
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'auto',
        });
      },
    }));

    return (
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%' }}
        scrollerRef={(element) => {
          scrollerRef(element as HTMLDivElement | null);
        }}
        data={messages}
        atBottomThreshold={NEAR_BOTTOM_PX}
        increaseViewportBy={{ top: 200, bottom: PERMISSION_CARD_VIEWPORT_PADDING }}
        followOutput={() =>
          stickToBottomRef.current && permissionRequests.length === 0 ? 'auto' : false
        }
        atBottomStateChange={(atBottom) => {
          stickToBottomRef.current = atBottom;
          onShowJumpToLatestChange(!atBottom);
        }}
        itemContent={(index, message) => (
          <Box
            sx={{
              maxWidth: CHAT_COLUMN_MAX_WIDTH,
              mx: 'auto',
              px: { xs: 1.5, sm: 2.5 },
              pt: index === 0 ? { xs: 1.5, sm: 2 } : 0,
            }}
          >
            {renderMessage(message, index)}
          </Box>
        )}
        components={{
          Scroller: forwardRef<HTMLDivElement, ComponentProps<'div'>>(function ChatScroller(
            { onScroll: virtuosoOnScroll, ...props },
            scrollerForwardedRef,
          ) {
            return (
              <div
                {...props}
                ref={scrollerForwardedRef}
                onScroll={(event) => {
                  virtuosoOnScroll?.(event);
                  onScroll();
                }}
              />
            );
          }),
          Footer: () => (
            <Box
              sx={{
                maxWidth: CHAT_COLUMN_MAX_WIDTH,
                mx: 'auto',
                px: { xs: 1.5, sm: 2.5 },
                pb: { xs: 1.5, sm: 2 },
              }}
            >
              {permissionRequests.map((request) => renderPermissionRequest(request))}
              <Box ref={bottomSentinelRef} sx={{ height: 1, width: '100%' }} aria-hidden />
            </Box>
          ),
        }}
      />
    );
  },
);
