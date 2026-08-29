import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  resolveInitialSidebarCollapsed,
  resolveSidebarWidth,
  SIDEBAR_AUTO_COLLAPSE_BELOW_PX,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './sidebarPrefs';

describe('resolveInitialSidebarCollapsed', () => {
  it('honors a persisted collapsed choice regardless of width', () => {
    expect(resolveInitialSidebarCollapsed('1', 2560)).toBe(true);
    expect(resolveInitialSidebarCollapsed('1', 900)).toBe(true);
  });

  it('honors a persisted expanded choice regardless of width', () => {
    expect(resolveInitialSidebarCollapsed('0', 2560)).toBe(false);
    expect(resolveInitialSidebarCollapsed('0', 900)).toBe(false);
  });

  it('defaults to collapsed on narrow desktop widths', () => {
    expect(resolveInitialSidebarCollapsed(null, SIDEBAR_AUTO_COLLAPSE_BELOW_PX - 1)).toBe(true);
    expect(resolveInitialSidebarCollapsed(null, 900)).toBe(true);
  });

  it('defaults to expanded on wide viewports', () => {
    expect(resolveInitialSidebarCollapsed(null, SIDEBAR_AUTO_COLLAPSE_BELOW_PX)).toBe(false);
    expect(resolveInitialSidebarCollapsed(null, 1920)).toBe(false);
  });

  it('treats unrecognized stored values like no preference', () => {
    expect(resolveInitialSidebarCollapsed('true', 1920)).toBe(false);
    expect(resolveInitialSidebarCollapsed('true', 1000)).toBe(true);
  });
});

describe('resolveSidebarWidth', () => {
  it('defaults when absent or invalid', () => {
    expect(resolveSidebarWidth(null)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(resolveSidebarWidth('')).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(resolveSidebarWidth('abc')).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('clamps persisted values into range', () => {
    expect(resolveSidebarWidth(String(SIDEBAR_MIN_WIDTH - 40))).toBe(SIDEBAR_MIN_WIDTH);
    expect(resolveSidebarWidth(String(SIDEBAR_MAX_WIDTH + 40))).toBe(SIDEBAR_MAX_WIDTH);
    expect(resolveSidebarWidth('300')).toBe(300);
  });
});

describe('clampSidebarWidth', () => {
  it('rounds and clamps', () => {
    expect(clampSidebarWidth(250.6)).toBe(251);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});
