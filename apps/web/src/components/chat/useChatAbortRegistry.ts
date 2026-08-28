import { useEffect, useRef, useState } from 'react';

export function useChatAbortRegistry() {
  const abortBySessionRef = useRef(new Map<string, AbortController>());
  const sendingSessionsRef = useRef(new Set<string>());
  const followingRef = useRef(new Set<string>());
  const [sendingSessionIds, setSendingSessionIds] = useState<string[]>([]);

  const beginSending = (id: string) => {
    sendingSessionsRef.current.add(id);
    setSendingSessionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const endSending = (id: string) => {
    sendingSessionsRef.current.delete(id);
    setSendingSessionIds((prev) => prev.filter((item) => item !== id));
  };

  const startSessionAbort = (id: string) => {
    abortBySessionRef.current.get(id)?.abort();
    const controller = new AbortController();
    abortBySessionRef.current.set(id, controller);
    return controller;
  };

  const releaseSessionAbort = (id: string, controller: AbortController) => {
    if (abortBySessionRef.current.get(id) === controller) {
      abortBySessionRef.current.delete(id);
    }
  };

  useEffect(
    () => () => {
      for (const controller of abortBySessionRef.current.values()) {
        controller.abort();
      }
      abortBySessionRef.current.clear();
      sendingSessionsRef.current.clear();
    },
    [],
  );

  return {
    abortBySessionRef,
    sendingSessionsRef,
    followingRef,
    sendingSessionIds,
    setSendingSessionIds,
    beginSending,
    endSending,
    startSessionAbort,
    releaseSessionAbort,
  };
}
