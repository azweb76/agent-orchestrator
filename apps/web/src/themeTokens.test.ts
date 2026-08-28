import { describe, expect, it } from 'vitest';
import { buildAoPalette } from './themeTokens';
import { createAppTheme } from './theme';

describe('buildAoPalette', () => {
  it('returns distinct surface tokens for dark and light modes', () => {
    const dark = buildAoPalette('dark');
    const light = buildAoPalette('light');

    expect(dark.surface.sidebar).not.toBe(light.surface.sidebar);
    expect(dark.surface.code).not.toBe(light.surface.code);
    expect(dark.diff.backdrop).not.toBe(light.diff.backdrop);
    expect(dark.action.onAccent).toBe('#0b0f17');
    expect(light.action.onAccent).toBe('#ffffff');
  });
});

describe('createAppTheme', () => {
  it('attaches ao palette tokens to both modes', () => {
    const dark = createAppTheme('dark');
    const light = createAppTheme('light');

    expect(dark.palette.ao.surface.panel).toBeTruthy();
    expect(light.palette.ao.surface.panel).toBeTruthy();
    expect(dark.palette.mode).toBe('dark');
    expect(light.palette.mode).toBe('light');
  });
});
