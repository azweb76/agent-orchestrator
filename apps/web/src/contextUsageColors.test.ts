import { describe, expect, it } from 'vitest';
import { percentFillColor, usageColorsForMode } from './components/chat/contextUsageColors';

describe('usageColorsForMode', () => {
  it('uses darker accents in light mode for contrast', () => {
    const dark = usageColorsForMode('dark');
    const light = usageColorsForMode('light');

    expect(light.cacheRead).toBe('#0d9488');
    expect(light.cacheWrite).toBe('#3f5fd6');
    expect(light.freshInput).toBe('#d97706');
    expect(dark.cacheRead).not.toBe(light.cacheRead);
    expect(percentFillColor(40, 'light')).toBe(light.stops[0]!.color);
    expect(percentFillColor(100, 'light')).toBe(light.stops[light.stops.length - 1]!.color);
  });
});
