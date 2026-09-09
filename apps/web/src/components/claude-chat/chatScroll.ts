import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatTranscriptHandle } from './ChatTranscriptList';

/** Distance from the bottom (px) still treated as "stuck" for auto-scroll. */
export const NEAR_BOTTOM_PX = 80;

export function isNearBottom(el: HTMLElement, thresholdPx = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

export function useChatScroll(activeSessionId: string, agentId: string, deps: {
  messageCount: number;
  permissionCount: number;
  messagesLoading: boolean;
}) {
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<ChatTranscriptHandle>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevPermissionCountRef = useRef(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  useEffect(() => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }, [agentId, activeSessionId]);

  useEffect(() => {
    const count = deps.permissionCount;
    if (count > prevPermissionCountRef.current) {
      transcriptRef.current?.scrollToBottom();
      stickToBottomRef.current = false;
      setShowJumpToLatest(true);
    }
    prevPermissionCountRef.current = count;
  }, [deps.permissionCount]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    if (deps.permissionCount > 0) return;
    transcriptRef.current?.scrollToBottom();
  }, [deps.messageCount, deps.permissionCount]);

  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    stickToBottomRef.current = near;
    setShowJumpToLatest(!near);
  }, []);

  const assignChatScrollerRef = useCallback((element: HTMLDivElement | null) => {
    chatScrollRef.current = element;
  }, []);

  useEffect(() => {
    const root = chatScrollRef.current;
    const target = bottomSentinelRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const near = Boolean(entry?.isIntersecting);
        stickToBottomRef.current = near;
        setShowJumpToLatest(!near && root.scrollHeight - root.clientHeight > NEAR_BOTTOM_PX);
      },
      { root, threshold: 0.01, rootMargin: '0px 0px 80px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [agentId, activeSessionId, deps.messageCount, deps.permissionCount, deps.messagesLoading]);

  const jumpToLatest = () => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    transcriptRef.current?.scrollToBottom();
  };

  const stickToBottom = () => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  };

  return {
    chatScrollRef,
    transcriptRef,
    bottomSentinelRef,
    stickToBottomRef,
    showJumpToLatest,
    setShowJumpToLatest,
    handleChatScroll,
    assignChatScrollerRef,
    jumpToLatest,
    stickToBottom,
  };
}
