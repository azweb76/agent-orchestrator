import { describe, expect, it } from 'vitest';
import type { TaskFollowUp } from '@agent-orchestrator/shared';
import { buildFollowUpPlanOverride, toPlanFollowUps } from './planFollowUps';

function followUp(overrides: Partial<TaskFollowUp> = {}): TaskFollowUp {
  return {
    id: 'fu-1',
    name: 'commit-and-push',
    title: 'Commit and push',
    description: 'Commit pending changes and push the branch.',
    prompt: 'Commit the pending changes and push the branch.',
    kind: 'prompt',
    template: null,
    enabled: true,
    trigger: 'exit-plan-mode',
    builtIn: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toPlanFollowUps', () => {
  it('maps the catalog into chip shape', () => {
    const catalog = [followUp()];
    expect(toPlanFollowUps(catalog)).toEqual([
      {
        id: 'fu-1',
        label: 'Commit and push',
        description: 'Commit pending changes and push the branch.',
        prompt: 'Commit the pending changes and push the branch.',
      },
    ]);
  });

  it('omits an empty description rather than passing an empty string', () => {
    const catalog = [followUp({ description: '' })];
    expect(toPlanFollowUps(catalog)[0]?.description).toBeUndefined();
  });

  it('returns an empty list for an empty catalog', () => {
    expect(toPlanFollowUps([])).toEqual([]);
  });
});

describe('buildFollowUpPlanOverride', () => {
  it('appends the follow-up prompt after the plan text', () => {
    const result = buildFollowUpPlanOverride('## Plan\n\nDo the thing.', {
      id: 'fu-1',
      label: 'Commit and push',
      prompt: 'Also commit and push when done.',
    });
    expect(result).toBe(
      '## Plan\n\nDo the thing.\n\n---\n\nAdditional instructions from the "Commit and push" follow-up:\nAlso commit and push when done.',
    );
  });

  it('returns undefined when there is no plan text to augment', () => {
    // Claude Code V2 can send an empty ExitPlanMode input; overriding with just
    // the follow-up text would drop the real plan Build resolves server-side.
    const result = buildFollowUpPlanOverride('   ', {
      id: 'fu-1',
      label: 'Continue',
      prompt: 'Keep going.',
    });
    expect(result).toBeUndefined();
  });
});
