import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { PendingImage } from './composerTypes';
import type { PendingMention } from './mentionComposer';

type LastFailed = {
  text: string;
  images: PendingImage[];
  mentions: PendingMention[];
} | null;

/** Mount flag, session-error reset, and permission-focus latch. */
export function useChatPanelSessionEffects(input: {
  mountedRef: MutableRefObject<boolean>;
  activeSessionId: string;
  setChatError: Dispatch<SetStateAction<string | null>>;
  setLastFailed: Dispatch<SetStateAction<LastFailed>>;
  awaitingPermissionFocus: boolean;
  permissionCount: number;
  permissionsFetched: boolean;
  setAwaitingPermissionFocus: (value: boolean) => void;
}): void {
  const {
    mountedRef,
    activeSessionId,
    setChatError,
    setLastFailed,
    awaitingPermissionFocus,
    permissionCount,
    permissionsFetched,
    setAwaitingPermissionFocus,
  } = input;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [mountedRef]);

  useEffect(() => {
    setChatError(null);
    setLastFailed(null);
  }, [activeSessionId, setChatError, setLastFailed]);

  useEffect(() => {
    if (!awaitingPermissionFocus) return;
    if (permissionCount > 0 || permissionsFetched) {
      setAwaitingPermissionFocus(false);
    }
  }, [
    awaitingPermissionFocus,
    permissionCount,
    permissionsFetched,
    setAwaitingPermissionFocus,
  ]);
}
