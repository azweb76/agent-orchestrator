import type { ReactNode } from 'react';
import { Box, useTheme } from '@mui/material';

export function HudPanel({ children, sx }: { children: ReactNode; sx?: object }) {
  const theme = useTheme();
  const ao = theme.palette.ao;

  return (
    <Box
      sx={{
        position: 'relative',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: ao.surface.panel,
        backdropFilter: 'blur(10px)',
        borderRadius: 2,
        p: 2.5,
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: ao.gradient.panelSheen,
          pointerEvents: 'none',
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
