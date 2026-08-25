import type { ReactNode } from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';

export interface TabStateProps {
  loading: boolean;
  error: unknown;
  isEmpty?: boolean;
  empty?: ReactNode;
  children: ReactNode;
}

/** Loading / error / empty shell shared by the pull request tabs. */
export function TabState({ loading, error, isEmpty, empty, children }: TabStateProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }
  if (isEmpty) {
    return <>{empty}</>;
  }
  return <>{children}</>;
}
