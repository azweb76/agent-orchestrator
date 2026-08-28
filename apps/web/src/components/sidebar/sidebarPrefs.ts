/**
 * Desktop viewports narrower than this start with the sidebar collapsed so
 * Chat/Changes get the horizontal space. An explicit user choice (persisted
 * in localStorage) always wins.
 */
export const SIDEBAR_AUTO_COLLAPSE_BELOW_PX = 1200;

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
