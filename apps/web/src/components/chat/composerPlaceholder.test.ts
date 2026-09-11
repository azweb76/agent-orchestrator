import { describe, expect, it } from 'vitest';
import { composerInputPlaceholder } from './composerPlaceholder';

describe('composerInputPlaceholder', () => {
  it('asks for a goal when chat is blocked without a goal', () => {
    expect(composerInputPlaceholder({ archived: true, goalLocked: true })).toBe(
      'Save a goal on the Goal tab before chatting.',
    );
  });

  it('uses the archived copy only when the agent is archived', () => {
    expect(composerInputPlaceholder({ archived: true, goalLocked: false })).toBe(
      'This agent is archived',
    );
  });

  it('uses the default composer copy when chat is open', () => {
    expect(composerInputPlaceholder({ archived: false })).toBe('Message Claude…');
  });
});
