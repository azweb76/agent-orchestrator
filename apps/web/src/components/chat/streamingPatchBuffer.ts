import { appendStreamText, coalesceTimelineText, type Message } from '@agent-orchestrator/shared';

export type StreamingAssistantPatcher = (
  sessionId: string,
  mutate: (message: Message) => Message,
) => void;

/**
 * Batches streaming token appends to one React Query update per animation frame.
 * Event patches and explicit flushes apply any buffered text first so tokens are
 * never dropped and timeline order stays correct.
 */
export function createStreamingPatchBuffer(patch: StreamingAssistantPatcher) {
  const tokenBuffers = new Map<string, string>();
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
    patch(sessionId, (message) => {
      const timeline = appendStreamText(message.metadata.timeline ?? [], buffered);
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

  const appendToken = (sessionId: string, token: string) => {
    tokenBuffers.set(sessionId, (tokenBuffers.get(sessionId) ?? '') + token);
    scheduleFlush(sessionId);
  };

  const patchStreaming = (sessionId: string, mutate: (message: Message) => Message) => {
    flushTokens(sessionId);
    patch(sessionId, mutate);
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
