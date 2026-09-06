import { describe, expect, it } from 'vitest';
import { applyAssistantStreamEvent } from './assistantStreamReducer';
import type { AssistantMessage } from '@agent-orchestrator/shared';

const baseUser: AssistantMessage = {
  id: 'optimistic-1',
  role: 'user',
  content: 'hi',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('applyAssistantStreamEvent', () => {
  it('replaces optimistic user and accumulates tokens', () => {
    let messages: AssistantMessage[] = [baseUser];

    messages = applyAssistantStreamEvent(messages, {
      type: 'user_message',
      message: {
        id: 'u1',
        role: 'user',
        content: 'hi',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('u1');

    messages = applyAssistantStreamEvent(messages, {
      type: 'assistant_start',
      messageId: 'a1',
      createdAt: '2026-01-01T00:00:02.000Z',
    });
    expect(messages[1]?.content).toBe('');

    messages = applyAssistantStreamEvent(messages, {
      type: 'token',
      messageId: 'a1',
      text: 'Hel',
    });
    messages = applyAssistantStreamEvent(messages, {
      type: 'token',
      messageId: 'a1',
      text: 'lo',
    });
    expect(messages[1]?.content).toBe('Hello');

    messages = applyAssistantStreamEvent(messages, {
      type: 'assistant_message',
      message: {
        id: 'a1',
        role: 'assistant',
        content: 'Hello',
        createdAt: '2026-01-01T00:00:02.000Z',
      },
    });
    expect(messages[1]?.content).toBe('Hello');
  });
});
