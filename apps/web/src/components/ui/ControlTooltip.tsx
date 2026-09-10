import { Tooltip, type TooltipProps } from '@mui/material';
import type { ReactElement, ReactNode } from 'react';
import { CURSOR_TOOLTIP_OFFSET, resolveControlTooltipConfig } from './controlTooltipConfig';

export type ControlTooltipProps = Omit<TooltipProps, 'title' | 'children'> & {
  title: ReactNode;
  children: ReactElement;
  /** Wrap the child in a span so tooltips still show when the control is disabled. */
  disabled?: boolean;
  /** Sidebar rail/tree: use a longer hover delay. */
  sidebar?: boolean;
};

const inlineWrapSx = { display: 'inline-flex', verticalAlign: 'middle' } as const;

export function ControlTooltip({
  title,
  children,
  disabled,
  sidebar,
  enterDelay,
  placement,
  disableInteractive,
  slotProps,
  ...rest
}: ControlTooltipProps) {
  const wrapped = disabled ? <span style={inlineWrapSx}>{children}</span> : children;
  const config = resolveControlTooltipConfig({ placement, enterDelay, disableInteractive, sidebar });

  return (
    <Tooltip
      title={title}
      enterDelay={config.enterDelay}
      placement={config.placement}
      followCursor={config.followCursor}
      disableInteractive={config.disableInteractive}
      describeChild
      slotProps={
        config.followCursor
          ? {
              ...slotProps,
              popper: {
                ...slotProps?.popper,
                popperOptions: { modifiers: [{ name: 'offset', options: { offset: CURSOR_TOOLTIP_OFFSET } }] },
              },
            }
          : slotProps
      }
      {...rest}
    >
      {wrapped}
    </Tooltip>
  );
}
