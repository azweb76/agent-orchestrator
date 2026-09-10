import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from 'react';
import { Box } from '@mui/material';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { ChatTranscriptItem, ChatTurn, PermissionPrompt } from './types';

export const CHAT_COLUMN_MAX_WIDTH = 780;

/** Distance from the bottom (px) still treated as "stuck" for auto-scroll. */
export const NEAR_BOTTOM_PX = 80;

export type ChatTranscriptHandle = {
  scrollToBottom: () => void;
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
};

type ChatTranscriptListProps = {
  messages?: ChatTurn[];
  items?: ChatTranscriptItem[];
  permissionRequests: PermissionPrompt[];
  scrollerRef: (element: HTMLDivElement | null) => void;
  bottomSentinelRef: Ref<HTMLDivElement | null>;
  stickToBottomRef: React.MutableRefObject<boolean>;
  onShowJumpToLatestChange: (show: boolean) => void;
  onScroll: () => void;
  renderMessage: (message: ChatTurn, index: number) => ReactNode;
  renderSessionBreak?: (sessionId: string, index: number) => ReactNode;
  renderPermissionRequest: (request: PermissionPrompt) => ReactNode;
  emptyState?: ReactNode;
  showEmptyState?: boolean;
};

/** Extra pixels below the fold so tall permission cards stay scrollable in Virtuoso. */
const PERMISSION_CARD_VIEWPORT_PADDING = 420;

type TranscriptListBridge = {
  scrollerRef: (element: HTMLDivElement | null) => void;
  onScroll: () => void;
  bottomSentinelRef: Ref<HTMLDivElement | null>;
  permissionRequests: PermissionPrompt[];
  renderPermissionRequest: (request: PermissionPrompt) => ReactNode;
  emptyState?: ReactNode;
  showEmptyState?: boolean;
};

const TranscriptListBridgeContext = createContext<TranscriptListBridge | null>(null);

function rowsFromProps(
  items: ChatTranscriptItem[] | undefined,
  messages: ChatTurn[] | undefined,
): ChatTranscriptItem[] {
  if (items) return items;
  return (messages ?? []).map((turn) => ({
    kind: 'turn' as const,
    id: turn.id,
    turn,
    sessionId: turn.sessionId ?? '',
  }));
}

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
        pt: bridge.showEmptyState ? 1 : 0,
        pb: { xs: 3, sm: 4 },
      }}
    >
      {bridge.showEmptyState ? bridge.emptyState : null}
      {bridge.permissionRequests.map((request) => bridge.renderPermissionRequest(request))}
      <Box ref={bridge.bottomSentinelRef} sx={{ height: 1, width: '100%' }} aria-hidden />
    </Box>
  );
});

const TranscriptRow = memo(function TranscriptRow({
  index,
  item,
  renderMessage,
  renderSessionBreak,
}: {
  index: number;
  item: ChatTranscriptItem;
  renderMessage: (message: ChatTurn, index: number) => ReactNode;
  renderSessionBreak?: (sessionId: string, index: number) => ReactNode;
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
      {item.kind === 'session'
        ? (renderSessionBreak?.(item.sessionId, index) ?? null)
        : renderMessage(item.turn, index)}
    </Box>
  );
});

export const ChatTranscriptList = forwardRef<ChatTranscriptHandle, ChatTranscriptListProps>(
  function ChatTranscriptList(
    {
      messages,
      items,
      permissionRequests,
      scrollerRef,
      bottomSentinelRef,
      stickToBottomRef,
      onShowJumpToLatestChange,
      onScroll,
      renderMessage,
      renderSessionBreak,
      renderPermissionRequest,
      emptyState,
      showEmptyState,
    },
    ref,
  ) {
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const permissionCountRef = useRef(permissionRequests.length);
    permissionCountRef.current = permissionRequests.length;
    const rows = useMemo(() => rowsFromProps(items, messages), [items, messages]);
    const rowsRef = useRef(rows);
    rowsRef.current = rows;

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        const last = rowsRef.current.length - 1;
        if (last < 0) return;
        virtuosoRef.current?.scrollToIndex({
          index: last,
          align: 'end',
          behavior: 'auto',
        });
      },
      scrollToIndex: (index, align = 'start') => {
        if (index < 0) return;
        virtuosoRef.current?.scrollToIndex({
          index,
          align,
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
      (index: number, item: ChatTranscriptItem) => (
        <TranscriptRow
          index={index}
          item={item}
          renderMessage={renderMessage}
          renderSessionBreak={renderSessionBreak}
        />
      ),
      [renderMessage, renderSessionBreak],
    );

    const bridge: TranscriptListBridge = {
      scrollerRef,
      onScroll,
      bottomSentinelRef,
      permissionRequests,
      renderPermissionRequest,
      emptyState,
      showEmptyState,
    };

    return (
      <TranscriptListBridgeContext.Provider value={bridge}>
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          scrollerRef={(element) => {
            scrollerRef(element as HTMLDivElement | null);
          }}
          data={rows}
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
