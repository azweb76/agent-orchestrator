import { describe, expect, it } from 'vitest';
import { buildAssistantStarters } from '@agent-orchestrator/shared';

describe('buildAssistantStarters', () => {
  it('falls back to generic starters when the queue is empty', () => {
    const starters = buildAssistantStarters({ items: [], runningCount: 0 });
    expect(starters).toHaveLength(3);
    expect(starters.map((s) => s.id)).toEqual(['queue', 'inbox', 'fleet']);
  });

  it('prefers failing CI and review items from the live queue', () => {
    const starters = buildAssistantStarters({
      items: [
        {
          id: 'fix-ci:acme/demo#12',
          kind: 'pr_failing_ci',
          title: '#12 Broken build',
          actionLabel: 'Fix CI on #12',
          action: {
            type: 'start_pr_template',
            template: 'fix-ci',
            owner: 'acme',
            repo: 'demo',
            number: 12,
          },
        },
        {
          id: 'review:acme/demo#9',
          kind: 'pr_review',
          title: '#9 Needs eyes',
          actionLabel: 'Review #9',
          action: {
            type: 'start_pr_template',
            template: 'address-review',
            owner: 'acme',
            repo: 'demo',
            number: 9,
          },
        },
      ],
      runningCount: 0,
    });

    expect(starters[0]?.label).toBe('Fix CI on #12');
    expect(starters[0]?.prompt).toContain('acme/demo#12');
    expect(starters[0]?.prompt).toContain('fix-ci');
    expect(starters[1]?.label).toBe('Address review on #9');
    expect(starters[1]?.prompt).toContain('address-review');
    expect(starters).toHaveLength(3);
  });

  it('aggregates multiple blocked agents into one unblock starter', () => {
    const starters = buildAssistantStarters({
      items: [
        {
          id: 'blocked:a1',
          kind: 'agent_blocked',
          title: 'Alpha needs input',
          actionLabel: 'Answer Alpha',
          action: { type: 'navigate', to: '/agents/a1' },
        },
        {
          id: 'blocked:a2',
          kind: 'agent_blocked',
          title: 'Beta needs input',
          actionLabel: 'Answer Beta',
          action: { type: 'navigate', to: '/agents/a2' },
        },
      ],
      runningCount: 2,
    });

    expect(starters[0]?.id).toBe('unblock-many');
    expect(starters[0]?.label).toBe('Unblock 2 agents');
    expect(starters[1]?.id).toBe('running');
  });
});
