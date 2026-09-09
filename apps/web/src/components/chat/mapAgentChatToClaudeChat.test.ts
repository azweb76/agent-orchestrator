import { describe, expect, it } from 'vitest';
import type { Message } from '@agent-orchestrator/shared';
import { mapMessageToChatTurn } from './mapAgentChatToClaudeChat';

describe('mapMessageToChatTurn', () => {
  it('maps timeline thinking, todos, and tools', () => {
    const message: Message = {
      id: 'm1',
      agentId: 'a1',
      sessionId: 's1',
      role: 'assistant',
      content: 'Hello',
      attachments: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      metadata: {
        streaming: true,
        timeline: [
          { type: 'thinking', id: 'th1', text: 'Hmm' },
          { type: 'text', id: 't1', text: 'Hello' },
          {
            type: 'tool',
            id: 'todo_1',
            name: 'TodoWrite',
            status: 'done',
            result: 'ok',
          },
          {
            type: 'todo_list',
            id: 'todos',
            items: [{ content: 'Ship kit', status: 'in_progress' }],
          },
        ],
      },
    };
    const turn = mapMessageToChatTurn(message);
    expect(turn.blocks?.map((block) => block.type)).toEqual([
      'thinking',
      'text',
      'tool_use',
      'todo_list',
    ]);
    expect(turn.streaming).toBe(true);
  });
});
