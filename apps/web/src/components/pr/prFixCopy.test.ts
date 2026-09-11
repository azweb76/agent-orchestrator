import { describe, expect, it } from 'vitest';
import { prFixCopy } from './prFixCopy';

describe('prFixCopy', () => {
  it('uses Fix labels when starting a session on the agent', () => {
    expect(prFixCopy('agent', 'fix-ci').label).toBe('Fix');
    expect(prFixCopy('agent', 'resolve-conflicts').label).toBe('Fix');
    expect(prFixCopy('agent', 'address-review').busyLabel).toBe('Starting…');
    expect(prFixCopy('agent', 'fix-ci').tooltip).toMatch(/this agent/i);
  });

  it('keeps Assistant wording on the standalone PR page', () => {
    expect(prFixCopy('assistant', 'fix-ci').label).toBe('Fix CI');
    expect(prFixCopy('assistant', 'resolve-conflicts').label).toBe('Resolve conflicts');
    expect(prFixCopy('assistant', 'fix-ci').busyLabel).toBe('Asking…');
  });
});
