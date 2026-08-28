import { describe, expect, it } from 'vitest';
import {
  resolveInitialSidebarCollapsed,
  SIDEBAR_AUTO_COLLAPSE_BELOW_PX,
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
