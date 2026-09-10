import { useEffect } from 'react';
import type { AgentAttentionFocus } from '../../notifications';

/** Scroll to a session break, or to the transcript bottom for permission prompts. */
export function useChatAttentionFocus(input: {
  focusAttention?: AgentAttentionFocus;
  focusSessionId?: string;
  sessionIdRef: { current: string };
  selectSession: (sessionId: string) => Promise<void> | void;
  setAwaitingPermissionFocus: (value: boolean) => void;
  setFocusPermissions: (value: boolean) => void;
  scrollToBottom: () => void;
  scrollToSession?: (sessionId: string) => void;
  stickToBottomRef: { current: boolean };
  setShowJumpToLatest: (value: boolean) => void;
}): void {
  const {
    focusAttention,
    focusSessionId,
    sessionIdRef,
    selectSession,
    setAwaitingPermissionFocus,
    setFocusPermissions,
    scrollToBottom,
    scrollToSession,
    stickToBottomRef,
    setShowJumpToLatest,
  } = input;

  useEffect(() => {
    if (!focusAttention) return;
    let cancelled = false;

    const revealAttention = () => {
      requestAnimationFrame(() => {
        if (focusAttention !== 'needs-input' && focusSessionId && scrollToSession) {
          scrollToSession(focusSessionId);
          stickToBottomRef.current = false;
          setShowJumpToLatest(true);
          return;
        }
        scrollToBottom();
        stickToBottomRef.current = false;
        setShowJumpToLatest(true);
      });
    };

    const run = async () => {
      if (focusSessionId && focusSessionId !== sessionIdRef.current) {
        await selectSession(focusSessionId);
        if (cancelled) return;
      }
      if (focusAttention === 'needs-input') {
        setAwaitingPermissionFocus(true);
        setFocusPermissions(true);
        window.setTimeout(() => setFocusPermissions(false), 4000);
      }
      revealAttention();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    focusAttention,
    focusSessionId,
    sessionIdRef,
    selectSession,
    setAwaitingPermissionFocus,
    setFocusPermissions,
    scrollToBottom,
    scrollToSession,
    stickToBottomRef,
    setShowJumpToLatest,
  ]);
}
