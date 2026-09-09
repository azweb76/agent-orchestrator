import type { ReactNode } from 'react';
import { Box } from '@mui/material';

export function FocusablePermissionShell({
  highlight,
  children,
}: {
  highlight: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={
        highlight
          ? {
              borderRadius: 2.5,
              animation: 'ao-permission-focus 1.1s ease-in-out 3',
              '@keyframes ao-permission-focus': {
                '0%, 100%': { outline: '2px solid transparent' },
                '50%': { outline: '2px solid', outlineColor: 'warning.main' },
              },
            }
          : undefined
      }
    >
      {children}
    </Box>
  );
}
