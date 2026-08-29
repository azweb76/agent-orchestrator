/**
 * Desktop viewports narrower than this start with the sidebar collapsed so
 * Chat/Changes get the horizontal space. An explicit user choice (persisted
 * in localStorage) always wins.
 */
export const SIDEBAR_AUTO_COLLAPSE_BELOW_PX = 1200;

/** Default expanded sidebar width (matches historical SIDEBAR_EXPANDED_WIDTH). */
export const SIDEBAR_DEFAULT_WIDTH = 232;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;

/**
 * Resolve the initial collapsed state from the persisted preference
 * (`'1'` collapsed / `'0'` expanded / absent) and the viewport width.
 */
export function resolveInitialSidebarCollapsed(
  stored: string | null,
  viewportWidth: number,
): boolean {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return viewportWidth < SIDEBAR_AUTO_COLLAPSE_BELOW_PX;
}

/** Clamp a candidate width into the allowed sidebar range. */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/**
 * Parse a persisted sidebar width string. Invalid or out-of-range values
 * fall back to the default.
 */
export function resolveSidebarWidth(stored: string | null): number {
  if (stored == null || stored === '') return SIDEBAR_DEFAULT_WIDTH;
  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidth(parsed);
}
