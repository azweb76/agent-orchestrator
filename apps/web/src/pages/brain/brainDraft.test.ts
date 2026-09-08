import { describe, expect, it } from 'vitest';
import {
  brainCreatePrompt,
  emptyBrainDraft,
  formatAskUserAnswers,
  latestAskUserQuestionsFromMessages,
  mergeBrainDraft,
  parseBrainDraft,
  type AssistantMessage,
} from '@agent-orchestrator/shared';

describe('parseBrainDraft', () => {
  it('parses a nested skill draft JSON string', () => {
    const draft = parseBrainDraft(
      JSON.stringify({
        ok: true,
        draft: {
          kind: 'skill',
          name: 'use-explore',
          description: 'Explore first',
          content: '---\nname: use-explore\n---\nUse Explore before Grep.',
        },
      }),
    );
    expect(draft?.kind).toBe('skill');
    if (draft?.kind === 'skill') {
      expect(draft.name).toBe('use-explore');
      expect(draft.content).toContain('Use Explore');
      expect(draft.content.startsWith('---')).toBe(false);
    }
  });
});

describe('mergeBrainDraft', () => {
  it('keeps dirty fields', () => {
    const current = emptyBrainDraft('skill');
    if (current.kind !== 'skill') throw new Error('expected skill');
    current.name = 'mine';
    current.content = 'edited';
    const proposed = emptyBrainDraft('skill');
    if (proposed.kind !== 'skill') throw new Error('expected skill');
    proposed.name = 'theirs';
    proposed.content = 'from-ai';
    proposed.description = 'when to use';
    const merged = mergeBrainDraft(current, proposed, new Set(['name', 'content']));
    expect(merged.kind).toBe('skill');
    if (merged.kind === 'skill') {
      expect(merged.name).toBe('mine');
      expect(merged.content).toBe('edited');
      expect(merged.description).toBe('when to use');
    }
  });
});

describe('ask_user pending questions', () => {
  it('hides questions after the user replies', () => {
    const ask: AssistantMessage = {
      id: 't1',
      role: 'tool',
      content: JSON.stringify({
        questions: [{ question: 'Scope?', options: [{ label: 'Personal', description: '' }] }],
      }),
      toolResult: { toolUseId: '1', toolName: 'ask_user', awaitingUser: true },
      createdAt: new Date().toISOString(),
    };
    expect(latestAskUserQuestionsFromMessages([ask])?.[0]?.question).toBe('Scope?');
    expect(
      latestAskUserQuestionsFromMessages([
        ask,
        { id: 'u1', role: 'user', content: 'Personal', createdAt: new Date().toISOString() },
      ]),
    ).toBeNull();
  });
});

describe('brain prompts', () => {
  it('asks the model to use ask_user and not write files', () => {
    expect(brainCreatePrompt('agent')).toMatch(/ask_user/);
    expect(brainCreatePrompt('agent')).toMatch(/propose_brain_draft/);
    expect(formatAskUserAnswers({ Scope: 'Personal' })).toBe('Answers:\nScope: Personal');
  });
});
