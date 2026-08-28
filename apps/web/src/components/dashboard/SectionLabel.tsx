import type { ReactNode } from 'react';
import { Typography } from '@mui/material';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        fontFamily: '"IBM Plex Mono", monospace',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'text.secondary',
      }}
    >
      {children}
    </Typography>
  );
}
