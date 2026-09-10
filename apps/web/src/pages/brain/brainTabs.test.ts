import { describe, expect, it } from 'vitest';
import {
  BRAIN_TABS,
  BRAIN_TAB_COPY,
  BRAIN_TAB_LABELS,
  brainPath,
  parseBrainTab,
} from './brainTabs';

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
    expect(parseBrainTab('copilot')).toBe('copilot');
  });

  it('round-trips every declared tab', () => {
    for (const tab of BRAIN_TABS) {
      expect(parseBrainTab(tab)).toBe(tab);
    }
  });

  it('builds Brain paths for deep links', () => {
    expect(brainPath()).toBe('/brain');
    expect(brainPath('skills')).toBe('/brain');
    expect(brainPath('agents')).toBe('/brain?tab=agents');
    expect(brainPath('tasks')).toBe('/brain?tab=tasks');
    expect(brainPath('follow-ups')).toBe('/brain?tab=follow-ups');
    expect(brainPath('copilot')).toBe('/brain?tab=copilot');
  });

  it('declares a label and an explainer for every tab', () => {
    for (const tab of BRAIN_TABS) {
      expect(BRAIN_TAB_LABELS[tab]?.length).toBeGreaterThan(0);
      expect(BRAIN_TAB_COPY[tab]?.length).toBeGreaterThan(0);
    }
  });
});
