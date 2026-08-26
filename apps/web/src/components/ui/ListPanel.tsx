import type { ElementType, ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

export interface ListPanelProps {
  children: ReactNode;
  sx?: object;
}

/** Bordered list container for scannable rows (not card grids). */
export function ListPanel({ children, sx }: ListPanelProps) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'rgba(18,24,38,0.55)',
        overflow: 'hidden',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

export interface ListRowProps {
  children: ReactNode;
  secondaryAction?: ReactNode;
  selected?: boolean;
  component?: ElementType;
  to?: string;
  href?: string;
  onClick?: () => void;
}

export function ListRow({
  children,
  secondaryAction,
  selected,
  component = 'div',
  to,
  href,
  onClick,
}: ListRowProps) {
  const interactive = Boolean(onClick || to || href);
  return (
    <Box
      component={component}
      to={to}
      href={href}
      onClick={onClick}
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 1.25, sm: 2 },
        px: { xs: 1.5, sm: 2.25 },
        py: { xs: 1.5, sm: 1.75 },
        textDecoration: 'none',
        color: 'inherit',
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: selected ? 'rgba(94,234,212,0.1)' : 'transparent',
        boxShadow: selected ? 'inset 3px 0 0 0 #5eead4' : 'none',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
        '&:last-child': { borderBottom: 'none' },
        '&:hover': interactive
          ? {
              bgcolor: 'rgba(94,234,212,0.05)',
            }
          : undefined,
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'secondary.main',
          outlineOffset: -2,
        },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
      {secondaryAction ? (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            flexWrap: 'wrap',
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {secondaryAction}
        </Stack>
      ) : null}
    </Box>
  );
}

export function ListRowTitle({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="body1"
      component="span"
      sx={{ fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere' }}
    >
      {children}
    </Typography>
  );
}

export function ListRowMeta({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ mt: 0.25, lineHeight: 1.4, overflowWrap: 'anywhere' }}
    >
      {children}
    </Typography>
  );
}
