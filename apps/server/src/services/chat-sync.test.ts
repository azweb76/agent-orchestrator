import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeChatMessages, type Message } from '@agent-orchestrator/shared';

function message(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  streaming?: boolean,
  timelineLength = 0,
): Message {
  return {
    id,
    agentId: 'ag-1',
    sessionId: 'sess-1',
    role,
    content,
    attachments: [],
    metadata: {
      streaming,
      timeline: Array.from({ length: timelineLength }, (_, index) => ({
        type: 'text' as const,
        id: `t${index}`,
        text: 'x',
      })),
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('mergeChatMessages', () => {
  it('returns remote when there is no local cache', () => {
    const remote = [message('u1', 'user', 'hi')];
    assert.deepEqual(mergeChatMessages(undefined, remote), remote);
    assert.deepEqual(mergeChatMessages([], remote), remote);
  });

  it('lets a completed server turn replace local streaming state', () => {
    const local = [message('a1', 'assistant', 'Hel', true, 1)];
    const remote = [message('a1', 'assistant', 'Hello', false, 2)];
    assert.equal(mergeChatMessages(local, remote)[0]?.content, 'Hello');
    assert.equal(mergeChatMessages(local, remote)[0]?.metadata.streaming, false);
  });

  it('does not resurrect streaming after the local turn already finished', () => {
    const local = [message('a1', 'assistant', 'Hello', false, 2)];
    const remote = [message('a1', 'assistant', 'Hel', true, 1)];
    const merged = mergeChatMessages(local, remote);
    assert.equal(merged[0]?.content, 'Hello');
    assert.equal(merged[0]?.metadata.streaming, false);
  });

  it('keeps the longer live stream over a lagged persist', () => {
    const local = [message('a1', 'assistant', 'Hello world', true, 4)];
    const remote = [message('a1', 'assistant', 'Hello', true, 1)];
    const merged = mergeChatMessages(local, remote);
    assert.equal(merged[0]?.content, 'Hello world');
    assert.equal(merged[0]?.metadata.timeline?.length, 4);
  });

  it('appends local-only messages the refetch has not seen yet', () => {
    const local = [message('u1', 'user', 'hi'), message('a1', 'assistant', '', true)];
    const remote = [message('u1', 'user', 'hi')];
    const merged = mergeChatMessages(local, remote);
    assert.equal(merged.length, 2);
    assert.equal(merged[1]?.id, 'a1');
  });

  it('keeps local-only ids when remote is empty (clear must reset local cache first)', () => {
    const local = [message('u1', 'user', 'hi'), message('a1', 'assistant', 'bye')];
    assert.equal(mergeChatMessages(local, []).length, 2);
    assert.deepEqual(mergeChatMessages([], []), []);
  });
});
