import { describe, expect, it } from 'vitest';
import {
  isBuildReadyForDraftPrStep,
  resolveAutopilotEnabled,
  shouldOfferDraftPr,
} from '@agent-orchestrator/shared';

describe('autopilot helpers', () => {
  it('resolveAutopilotEnabled uses global default when agent override is null', () => {
    expect(resolveAutopilotEnabled({ autopilot: true }, null)).toBe(true);
    expect(resolveAutopilotEnabled({ autopilot: false }, undefined)).toBe(false);
  });

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
