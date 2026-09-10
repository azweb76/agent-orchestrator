import { describe, expect, it } from 'vitest';
import { nextCommittedSessionTitle, shouldActivateSessionBreak } from './sessionBreakActions';

describe('nextCommittedSessionTitle', () => {
  it('returns null for blank or unchanged titles', () => {
    expect(nextCommittedSessionTitle('  ', 'Plan')).toBeNull();
    expect(nextCommittedSessionTitle('Plan', 'Plan')).toBeNull();
    expect(nextCommittedSessionTitle('  Plan  ', 'Plan')).toBeNull();
  });

  it('trims and caps the next title', () => {
    expect(nextCommittedSessionTitle('  Build  ', 'Plan')).toBe('Build');
    expect(nextCommittedSessionTitle('a'.repeat(90), 'Plan')?.length).toBe(80);
  });
});

describe('shouldActivateSessionBreak', () => {
  it('activates on click unless the title is being edited', () => {
    expect(shouldActivateSessionBreak(false)).toBe(true);
    expect(shouldActivateSessionBreak(true)).toBe(false);
  });
});
