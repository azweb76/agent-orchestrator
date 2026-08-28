import { Tooltip, type TooltipProps } from '@mui/material';
import type { ReactElement, ReactNode } from 'react';

export type ControlTooltipProps = Omit<TooltipProps, 'title' | 'children'> & {
  title: ReactNode;
  children: ReactElement;
  /** Wrap the child in a span so tooltips still show when the control is disabled. */
  disabled?: boolean;
  /** Sidebar rail/tree: show on the right with a longer hover delay. */
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
  ...rest
}: ControlTooltipProps) {
  const wrapped = disabled ? <span style={inlineWrapSx}>{children}</span> : children;

  return (
    <Tooltip
      title={title}
      enterDelay={enterDelay ?? (sidebar ? 500 : 300)}
      placement={placement ?? (sidebar ? 'right' : 'bottom')}
      describeChild
      {...rest}
    >
      {wrapped}
    </Tooltip>
  );
}
