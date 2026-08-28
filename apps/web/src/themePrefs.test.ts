import { describe, expect, it } from 'vitest';
import { resolveThemeMode } from './themePrefs';

describe('resolveThemeMode', () => {
  it('returns dark and light directly', () => {
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('light', true)).toBe('light');
  });

  it('follows prefers-color-scheme when set to system', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
  });
});
