import type { ReactNode } from 'react';
import { Box } from '@mui/material';

/** Keeps agent-page panels mounted while hiding inactive tabs. */
export function AgentPageTabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      {children}
    </Box>
  );
}
