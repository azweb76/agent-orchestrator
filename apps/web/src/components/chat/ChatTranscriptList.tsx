import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
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

type TranscriptListBridge = {
  scrollerRef: (element: HTMLDivElement | null) => void;
  onScroll: () => void;
  bottomSentinelRef: Ref<HTMLDivElement | null>;
  permissionRequests: PermissionRequest[];
  renderPermissionRequest: (request: PermissionRequest) => ReactNode;
};

const TranscriptListBridgeContext = createContext<TranscriptListBridge | null>(null);

/** Stable Virtuoso scroller — defined once so the list is not remounted each render. */
const ChatScroller = forwardRef<HTMLDivElement, ComponentProps<'div'>>(function ChatScroller(
  { onScroll: virtuosoOnScroll, ...props },
  scrollerForwardedRef,
) {
  const bridge = useContext(TranscriptListBridgeContext);
  return (
    <div
      {...props}
      ref={scrollerForwardedRef}
      onScroll={(event) => {
        virtuosoOnScroll?.(event);
        bridge?.onScroll();
      }}
    />
  );
});

const ChatTranscriptFooter = memo(function ChatTranscriptFooter() {
  const bridge = useContext(TranscriptListBridgeContext);
  if (!bridge) return null;
  return (
    <Box
      sx={{
        maxWidth: CHAT_COLUMN_MAX_WIDTH,
        mx: 'auto',
        px: { xs: 1.5, sm: 2.5 },
        pb: { xs: 1.5, sm: 2 },
      }}
    >
      {bridge.permissionRequests.map((request) => bridge.renderPermissionRequest(request))}
      <Box ref={bridge.bottomSentinelRef} sx={{ height: 1, width: '100%' }} aria-hidden />
    </Box>
  );
});

const TranscriptMessageRow = memo(function TranscriptMessageRow({
  index,
  message,
  renderMessage,
}: {
  index: number;
  message: Message;
  renderMessage: (message: Message, index: number) => ReactNode;
}) {
  return (
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
  );
});

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
    const permissionCountRef = useRef(permissionRequests.length);
    permissionCountRef.current = permissionRequests.length;

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'auto',
        });
      },
    }));

    const followOutput = useCallback(
      () => (stickToBottomRef.current && permissionCountRef.current === 0 ? 'auto' : false),
      [stickToBottomRef],
    );

    const atBottomStateChange = useCallback(
      (atBottom: boolean) => {
        stickToBottomRef.current = atBottom;
        onShowJumpToLatestChange(!atBottom);
      },
      [onShowJumpToLatestChange, stickToBottomRef],
    );

    const itemContent = useCallback(
      (index: number, message: Message) => (
        <TranscriptMessageRow index={index} message={message} renderMessage={renderMessage} />
      ),
      [renderMessage],
    );

    const bridge: TranscriptListBridge = {
      scrollerRef,
      onScroll,
      bottomSentinelRef,
      permissionRequests,
      renderPermissionRequest,
    };

    return (
      <TranscriptListBridgeContext.Provider value={bridge}>
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          scrollerRef={(element) => {
            scrollerRef(element as HTMLDivElement | null);
          }}
          data={messages}
          atBottomThreshold={NEAR_BOTTOM_PX}
          increaseViewportBy={{ top: 200, bottom: PERMISSION_CARD_VIEWPORT_PADDING }}
          followOutput={followOutput}
          atBottomStateChange={atBottomStateChange}
          itemContent={itemContent}
          components={{
            Scroller: ChatScroller,
            Footer: ChatTranscriptFooter,
          }}
        />
      </TranscriptListBridgeContext.Provider>
    );
  },
);
