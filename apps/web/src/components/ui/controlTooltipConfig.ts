import type { TooltipProps } from '@mui/material';

export type ControlTooltipConfigInput = {
  placement?: TooltipProps['placement'];
  enterDelay?: number;
  disableInteractive?: boolean;
  sidebar?: boolean;
};

export type ControlTooltipConfig = {
  placement: TooltipProps['placement'];
  enterDelay: number;
  disableInteractive: boolean;
  followCursor: boolean;
};

// Tooltips land above-and-right of the pointer instead of directly over the
// hovered control, so they don't block the control (or its neighbors) while
// the mouse hasn't moved away yet.
export const CURSOR_TOOLTIP_PLACEMENT: TooltipProps['placement'] = 'top-start';
export const CURSOR_TOOLTIP_OFFSET: [number, number] = [8, 12];

/**
 * Resolves the placement/delay/interactivity a ControlTooltip renders with.
 *
 * Callers that pass an explicit `placement` keep the tooltip anchored to the
 * control (e.g. inside a menu, where following the cursor would look wrong).
 * Everyone else gets a cursor-following tooltip so it can never sit on top of
 * the control it describes.
 */
export function resolveControlTooltipConfig({
  placement,
  enterDelay,
  disableInteractive,
  sidebar,
}: ControlTooltipConfigInput): ControlTooltipConfig {
  const followCursor = placement === undefined;

  return {
    placement: placement ?? CURSOR_TOOLTIP_PLACEMENT,
    enterDelay: enterDelay ?? (sidebar ? 500 : 300),
    disableInteractive: disableInteractive ?? true,
    followCursor,
  };
}
