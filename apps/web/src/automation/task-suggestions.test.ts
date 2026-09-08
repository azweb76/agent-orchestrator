import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TASK_FOLLOWUPS,
  EXCESSIVE_ASSISTANT_TURNS,
  EXCESSIVE_USER_TURNS,
  describeExcessiveSessionUsage,
  isSessionUsageExcessive,
  measureSessionUsage,
  toTaskSuggestions,
} from '@agent-orchestrator/shared';

describe('toTaskSuggestions', () => {
  it('maps drafts to chips with generated ids', () => {
    const suggestions = toTaskSuggestions(
      [{ title: 'Continue', prompt: 'Keep going.', kind: 'prompt' }],
      () => 'id-1',
    );
    expect(suggestions).toEqual([
      {
        id: 'id-1',
        title: 'Continue',
        description: undefined,
        prompt: 'Keep going.',
        kind: 'prompt',
        template: undefined,
      },
    ]);
  });
});

describe('built-in follow-up catalog', () => {
  it('includes continue and grade-session seeds for AI to choose from', () => {
    expect(BUILTIN_TASK_FOLLOWUPS.some((item) => item.name === 'continue')).toBe(true);
    expect(BUILTIN_TASK_FOLLOWUPS.find((item) => item.name === 'grade-session')?.kind).toBe(
      'grade-session',
    );
  });
});

describe('session usage efficiency heuristics', () => {
  it('measures turns, tokens, and cost from messages', () => {
    const usage = measureSessionUsage([
      { role: 'user', content: 'a'.repeat(40) },
      {
        role: 'assistant',
        content: 'b'.repeat(40),
        metadata: {
          costUsd: 0.12,
          timeline: [{ type: 'text', text: 'c'.repeat(40) }],
        },
      },
    ]);
    expect(usage.userTurns).toBe(1);
    expect(usage.assistantTurns).toBe(1);
    expect(usage.estimatedTokens).toBe(30);
    expect(usage.costUsd).toBe(0.12);
  });

  it('flags excessive turns and describes why', () => {
    expect(
      isSessionUsageExcessive({
        userTurns: EXCESSIVE_USER_TURNS,
        assistantTurns: EXCESSIVE_ASSISTANT_TURNS,
        estimatedTokens: 10,
        costUsd: null,
      }),
    ).toBe(true);
    const detail = describeExcessiveSessionUsage({
      userTurns: EXCESSIVE_USER_TURNS,
      assistantTurns: 1,
      estimatedTokens: 10,
      costUsd: null,
    });
    expect(detail).toMatch(/turns/);
  });
});
