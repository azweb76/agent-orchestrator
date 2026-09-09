import { describe, expect, it } from 'vitest';
import type { AssistantMessage } from '@agent-orchestrator/shared';
import { assistantAskUserPermission, mapAssistantMessagesToChatTurns } from './mapAssistantChat';

describe('mapAssistantMessagesToChatTurns', () => {
  it('folds tool results onto the previous assistant turn', () => {
    const messages: AssistantMessage[] = [
      { id: 'u1', role: 'user', content: 'Draft a skill', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: 'Working on it.', createdAt: '2026-01-01T00:00:01.000Z' },
      {
        id: 't1',
        role: 'tool',
        content: JSON.stringify({ ok: true, files: [{ kind: 'skill', name: 'x', content: 'y' }] }),
        toolResult: { toolUseId: '1', toolName: 'propose_brain_draft' },
        createdAt: '2026-01-01T00:00:02.000Z',
      },
    ];
    const turns = mapAssistantMessagesToChatTurns(messages, new Set());
    expect(turns).toHaveLength(2);
    expect(turns[1]?.blocks?.some((block) => block.type === 'tool_use' && block.name === 'propose_brain_draft')).toBe(
      true,
    );
  });
});

describe('assistantAskUserPermission', () => {
  it('maps pending ask_user tools to AskUserQuestion', () => {
    const messages: AssistantMessage[] = [
      {
        id: 't1',
        role: 'tool',
        content: JSON.stringify({
          questions: [{ question: 'Scope?', options: [{ label: 'Personal' }] }],
        }),
        toolResult: { toolUseId: '1', toolName: 'ask_user', awaitingUser: true },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const prompt = assistantAskUserPermission(messages);
    expect(prompt?.toolName).toBe('AskUserQuestion');
    expect((prompt?.input.questions as Array<{ question: string }>)[0]?.question).toBe('Scope?');
  });
});
