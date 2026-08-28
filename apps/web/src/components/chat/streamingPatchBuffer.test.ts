import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from '@agent-orchestrator/shared';
import { createStreamingPatchBuffer } from './streamingPatchBuffer';

function streamingAssistant(content = ''): Message {
  return {
    id: 'assistant-1',
    agentId: 'agent-1',
    sessionId: 'session-1',
    role: 'assistant',
    content,
    attachments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: { streaming: true, timeline: [] },
  };
}

describe('createStreamingPatchBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return setTimeout(() => callback(performance.now()), 0) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('coalesces token appends into one patch per animation frame', () => {
    const patches: string[] = [];
    const buffer = createStreamingPatchBuffer((_sessionId, mutate) => {
      const next = mutate(streamingAssistant(patches.at(-1) ?? ''));
      patches.push(next.content);
    });

    buffer.appendToken('s1', 'hel');
    buffer.appendToken('s1', 'lo');
    expect(patches).toEqual([]);

    vi.runAllTimers();
    expect(patches).toEqual(['hello']);
    buffer.dispose();
  });

  it('flushes buffered tokens before timeline event patches', () => {
    const contents: string[] = [];
    const buffer = createStreamingPatchBuffer((_sessionId, mutate) => {
      contents.push(mutate(streamingAssistant(contents.at(-1) ?? '')).content);
    });

    buffer.appendToken('s1', 'hi');
    buffer.patchStreaming('s1', (message) => ({
      ...message,
      content: `${message.content}!`,
    }));

    expect(contents).toEqual(['hi', 'hi!']);
    buffer.dispose();
  });

  it('flushAll applies any remaining buffered text immediately', () => {
    const patches: string[] = [];
    const buffer = createStreamingPatchBuffer((_sessionId, mutate) => {
      patches.push(mutate(streamingAssistant()).content);
    });

    buffer.appendToken('s1', 'done');
    buffer.flushAll('s1');
    expect(patches).toEqual(['done']);
    buffer.dispose();
  });
});
