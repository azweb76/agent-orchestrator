import { describe, expect, it } from 'vitest';
import { resolveAgentDeliveryPhase } from '@agent-orchestrator/shared';

describe('resolveAgentDeliveryPhase', () => {
  it('returns archived and merged first', () => {
    expect(resolveAgentDeliveryPhase({ archived: true })).toBe('archived');
    expect(
      resolveAgentDeliveryPhase({
        pr: {
          state: 'closed',
          merged: true,
          draft: false,
          reviewCommentCount: 0,
          mergeable: true,
          mergeableState: 'clean',
        },
      }),
    ).toBe('merged');
  });

  it('maps open PR signals to CI / review / ready phases', () => {
    const base = {
      state: 'open' as const,
      merged: false,
      draft: false,
      reviewCommentCount: 0,
      mergeable: true as boolean | null,
      mergeableState: 'clean' as const,
    };

    expect(
      resolveAgentDeliveryPhase({
        pr: base,
        checks: { rollup: 'failure', failing: 2 },
      }),
    ).toBe('checks_failing');

    expect(
      resolveAgentDeliveryPhase({
        pr: { ...base, reviewCommentCount: 1 },
        checks: { rollup: 'success', failing: 0 },
      }),
    ).toBe('changes_requested');

    expect(
      resolveAgentDeliveryPhase({
        pr: base,
        checks: { rollup: 'success', failing: 0 },
      }),
    ).toBe('ready_to_merge');

    expect(
      resolveAgentDeliveryPhase({
        pr: { ...base, draft: true, mergeableState: 'draft' },
        checks: { rollup: 'success', failing: 0 },
      }),
    ).toBe('pr_draft');
  });

  it('uses session activity when there is no open PR', () => {
    expect(
      resolveAgentDeliveryPhase({
        needsDraftPr: true,
        sessions: [{ template: 'build', status: 'idle', permissionMode: 'auto' }],
      }),
    ).toBe('needs_pr');

    expect(
      resolveAgentDeliveryPhase({
        sessions: [{ template: 'build', status: 'running', permissionMode: 'auto' }],
      }),
    ).toBe('building');

    expect(
      resolveAgentDeliveryPhase({
        sessions: [{ template: 'chat', status: 'running', permissionMode: 'plan' }],
      }),
    ).toBe('planning');
  });
});
