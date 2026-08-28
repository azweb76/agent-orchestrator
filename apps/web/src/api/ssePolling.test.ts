import { describe, expect, it } from 'vitest';
import { SSE_FALLBACK_ACTIVE_POLL_MS, SSE_FALLBACK_POLL_MS } from './ssePolling';

describe('ssePolling constants', () => {
  it('uses a slower idle fallback than the active-workload fallback', () => {
    expect(SSE_FALLBACK_POLL_MS).toBeGreaterThan(SSE_FALLBACK_ACTIVE_POLL_MS);
  });
});
