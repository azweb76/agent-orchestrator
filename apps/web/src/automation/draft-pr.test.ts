import { describe, expect, it } from 'vitest';
import { isBuildReadyForDraftPrStep, shouldOfferDraftPr } from '@agent-orchestrator/shared';

describe('draft PR helpers', () => {
  it('isBuildReadyForDraftPrStep rejects stopped or errored build sessions', () => {
    expect(
      isBuildReadyForDraftPrStep({ template: 'build', status: 'idle', stopped: true }),
    ).toBe(false);
    expect(
      isBuildReadyForDraftPrStep({ template: 'build', status: 'idle', error: 'boom' }),
    ).toBe(false);
    expect(isBuildReadyForDraftPrStep({ template: 'build', status: 'idle' })).toBe(true);
  });

  it('shouldOfferDraftPr combines session state with worktree gates', () => {
    expect(
      shouldOfferDraftPr({
        template: 'build',
        status: 'running',
        hasDiff: true,
        hasOpenPr: false,
      }),
    ).toBe(false);
  });
});
