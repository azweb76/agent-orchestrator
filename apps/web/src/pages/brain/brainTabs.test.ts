import { describe, expect, it } from 'vitest';
import { brainPath, parseBrainTab } from './brainTabs';

describe('brainTabs', () => {
  it('defaults unknown values to skills', () => {
    expect(parseBrainTab(null)).toBe('skills');
    expect(parseBrainTab('')).toBe('skills');
    expect(parseBrainTab('nope')).toBe('skills');
  });

  it('accepts known tabs', () => {
    expect(parseBrainTab('skills')).toBe('skills');
    expect(parseBrainTab('agents')).toBe('agents');
    expect(parseBrainTab('tasks')).toBe('tasks');
    expect(parseBrainTab('follow-ups')).toBe('follow-ups');
  });

  it('builds Brain paths for deep links', () => {
    expect(brainPath()).toBe('/brain');
    expect(brainPath('skills')).toBe('/brain');
    expect(brainPath('agents')).toBe('/brain?tab=agents');
    expect(brainPath('tasks')).toBe('/brain?tab=tasks');
    expect(brainPath('follow-ups')).toBe('/brain?tab=follow-ups');
  });
});
