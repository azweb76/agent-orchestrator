import { describe, expect, it } from 'vitest';
import type { AgentTask } from '@agent-orchestrator/shared';
import { CHAT_EMPTY_STATE_DESCRIPTION, listedTasksForEmptyState } from './chatEmptyState';

function task(partial: Pick<AgentTask, 'name' | 'listed'>): AgentTask {
  return {
    id: partial.name,
    name: partial.name,
    title: partial.name,
    description: '',
    purpose: '',
    promptTemplate: null,
    systemPrompt: null,
    allowedTools: null,
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    listed: partial.listed,
    builtIn: false,
    createdAt: '',
    updatedAt: '',
  };
}

describe('CHAT_EMPTY_STATE_DESCRIPTION', () => {
  it('describes stacked sessions without a new-session control', () => {
    expect(CHAT_EMPTY_STATE_DESCRIPTION).toMatch(/one after another/);
    expect(CHAT_EMPTY_STATE_DESCRIPTION).not.toMatch(/\+/);
    expect(CHAT_EMPTY_STATE_DESCRIPTION).not.toMatch(/New session/i);
  });
});

describe('listedTasksForEmptyState', () => {
  it('keeps only listed Brain Tasks', () => {
    expect(
      listedTasksForEmptyState([
        task({ name: 'review', listed: true }),
        task({ name: 'build', listed: false }),
      ]).map((item) => item.name),
    ).toEqual(['review']);
  });
});
