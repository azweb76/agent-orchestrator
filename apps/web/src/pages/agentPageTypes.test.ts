import { describe, expect, it } from 'vitest';
import {
  AGENT_PAGE_TAB,
  agentHasGoal,
  agentPagePrTabLabel,
  defaultAgentPageTab,
} from './agentPageTypes';

describe('defaultAgentPageTab', () => {
  it('opens Goal when the agent has no goal', () => {
    expect(agentHasGoal('')).toBe(false);
    expect(agentHasGoal('  ')).toBe(false);
    expect(defaultAgentPageTab(false)).toBe(AGENT_PAGE_TAB.goal);
  });

  it('opens Chat when a goal is saved', () => {
    expect(agentHasGoal('Ship dark mode')).toBe(true);
    expect(defaultAgentPageTab(true)).toBe(AGENT_PAGE_TAB.chat);
  });

  it('places Pull Request after Files and before Memory', () => {
    expect(AGENT_PAGE_TAB.files).toBe(2);
    expect(AGENT_PAGE_TAB.pr).toBe(3);
    expect(AGENT_PAGE_TAB.memory).toBe(4);
  });
});

describe('agentPagePrTabLabel', () => {
  it('uses Pull Request and appends the linked number', () => {
    expect(agentPagePrTabLabel(null)).toBe('Pull Request');
    expect(agentPagePrTabLabel(0)).toBe('Pull Request');
    expect(agentPagePrTabLabel(12)).toBe('Pull Request (#12)');
  });
});
