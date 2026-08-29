import { appendStreamText, coalesceTimelineText, type Message } from '@agent-orchestrator/shared';

export type StreamingAssistantPatcher = (
  sessionId: string,
  messageId: string,
  mutate: (message: Message) => Message,
) => void;

interface TokenBuffer {
  messageId: string;
  text: string;
}

/**
 * Batches streaming token appends to one React Query update per animation frame.
 * Event patches and explicit flushes apply any buffered text first so tokens are
 * never dropped and timeline order stays correct. A token buffered under one
 * messageId is flushed before a different messageId starts buffering for the
 * same session, so text is never attributed to the wrong message.
 */
export function createStreamingPatchBuffer(patch: StreamingAssistantPatcher) {
  const tokenBuffers = new Map<string, TokenBuffer>();
  const rafIds = new Map<string, number>();

  const cancelScheduledFlush = (sessionId: string) => {
    const rafId = rafIds.get(sessionId);
    if (rafId === undefined) return;
    cancelAnimationFrame(rafId);
    rafIds.delete(sessionId);
  };

  const flushTokens = (sessionId: string) => {
    cancelScheduledFlush(sessionId);
    const buffered = tokenBuffers.get(sessionId);
    if (!buffered) return;
    tokenBuffers.delete(sessionId);
    patch(sessionId, buffered.messageId, (message) => {
      const timeline = appendStreamText(message.metadata.timeline ?? [], buffered.text);
      return {
        ...message,
        content: coalesceTimelineText(timeline),
        metadata: {
          ...message.metadata,
          streaming: true,
          timeline,
        },
      };
    });
  };

  const scheduleFlush = (sessionId: string) => {
    if (rafIds.has(sessionId)) return;
    rafIds.set(
      sessionId,
      requestAnimationFrame(() => {
        rafIds.delete(sessionId);
        flushTokens(sessionId);
      }),
    );
  };

  const appendToken = (sessionId: string, messageId: string, token: string) => {
    const buffered = tokenBuffers.get(sessionId);
    if (buffered && buffered.messageId !== messageId) {
      flushTokens(sessionId);
    }
    const current = tokenBuffers.get(sessionId);
    tokenBuffers.set(sessionId, {
      messageId,
      text: (current?.messageId === messageId ? current.text : '') + token,
    });
    scheduleFlush(sessionId);
  };

  const patchStreaming = (
    sessionId: string,
    messageId: string,
    mutate: (message: Message) => Message,
  ) => {
    flushTokens(sessionId);
    patch(sessionId, messageId, mutate);
  };

  const flushAll = (sessionId: string) => {
    flushTokens(sessionId);
  };

  const dispose = () => {
    for (const sessionId of [...rafIds.keys()]) {
      flushTokens(sessionId);
    }
  };

  return { appendToken, patchStreaming, flushAll, dispose };
}
