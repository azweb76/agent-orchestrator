import { describe, expect, it } from 'vitest';
import type { ChatSession, Message } from '@agent-orchestrator/shared';
import {
  buildChatTranscriptItems,
  flattenSessionMessages,
  priorUserByMessageId,
  transcriptIndexForSession,
} from './buildChatTranscriptItems';

function session(partial: Partial<ChatSession> & Pick<ChatSession, 'id' | 'title'>): ChatSession {
  return {
    agentId: 'ag-1',
    template: 'chat',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function message(partial: Partial<Message> & Pick<Message, 'id' | 'sessionId' | 'role'>): Message {
  return {
    agentId: 'ag-1',
    content: '',
    attachments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...partial,
  };
}

describe('buildChatTranscriptItems', () => {
  it('emits a session break even when the session has no messages', () => {
    const plan = session({ id: 's1', title: 'Plan' });
    const items = buildChatTranscriptItems([plan], {});
    expect(items).toEqual([{ kind: 'session', id: 'session:s1', sessionId: 's1' }]);
  });

  it('orders sessions then their turns, tagging turns with sessionId', () => {
    const plan = session({ id: 's1', title: 'Plan', createdAt: '2026-01-01T00:00:00.000Z' });
    const build = session({
      id: 's2',
      title: 'Build',
      template: 'build',
      permissionMode: 'auto',
      createdAt: '2026-01-01T01:00:00.000Z',
    });
    const items = buildChatTranscriptItems(
      [plan, build],
      {
        s1: [message({ id: 'm1', sessionId: 's1', role: 'user', content: 'plan this' })],
        s2: [message({ id: 'm2', sessionId: 's2', role: 'user', content: 'implement' })],
      },
    );
    expect(items.map((item) => item.kind)).toEqual(['session', 'turn', 'session', 'turn']);
    expect(items[0]).toMatchObject({ kind: 'session', sessionId: 's1' });
    expect(items[1]).toMatchObject({ kind: 'turn', sessionId: 's1', turn: { id: 'm1', sessionId: 's1' } });
    expect(items[2]).toMatchObject({ kind: 'session', sessionId: 's2' });
    expect(items[3]).toMatchObject({ kind: 'turn', sessionId: 's2', turn: { id: 'm2' } });
    expect(transcriptIndexForSession(items, 's2')).toBe(2);
  });
});

describe('priorUserByMessageId', () => {
  it('scopes prior user to the same session', () => {
    const messages = flattenSessionMessages(
      [session({ id: 's1', title: 'A' }), session({ id: 's2', title: 'B' })],
      {
        s1: [
          message({ id: 'u1', sessionId: 's1', role: 'user', content: 'one' }),
          message({ id: 'a1', sessionId: 's1', role: 'assistant', content: 'ok' }),
        ],
        s2: [
          message({ id: 'u2', sessionId: 's2', role: 'user', content: 'two' }),
          message({ id: 'a2', sessionId: 's2', role: 'assistant', content: 'done' }),
        ],
      },
    );
    const prior = priorUserByMessageId(messages);
    expect(prior.get('a1')?.id).toBe('u1');
    expect(prior.get('a2')?.id).toBe('u2');
    expect(prior.get('u2')?.id).toBeUndefined();
  });
});
