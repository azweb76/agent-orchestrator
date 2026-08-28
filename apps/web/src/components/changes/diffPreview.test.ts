import { describe, expect, it } from 'vitest';
import { MAX_DIFF_PREVIEW_LINES, truncatePatch } from './diffPreview';

describe('truncatePatch', () => {
  it('returns the original patch when under the line cap', () => {
    const patch = 'diff --git a/foo b/foo\n+line\n';
    const result = truncatePatch(patch, 10);
    expect(result.truncated).toBe(false);
    expect(result.patch).toBe(patch);
  });

  it('truncates large patches with a notice line', () => {
    const lines = Array.from({ length: MAX_DIFF_PREVIEW_LINES + 5 }, (_, i) => `+line ${i}`);
    const patch = lines.join('\n');
    const result = truncatePatch(patch);
    expect(result.truncated).toBe(true);
    expect(result.totalLines).toBe(MAX_DIFF_PREVIEW_LINES + 5);
    expect(result.patch).toMatch(/more lines not shown/);
  });
});
