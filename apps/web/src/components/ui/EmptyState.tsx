import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <Box
      sx={{
        textAlign: 'center',
        py: compact ? 4 : 6,
        px: { xs: 2, sm: 3 },
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'rgba(18,24,38,0.4)',
      }}
    >
      <Stack spacing={1.5} sx={{ alignItems: 'center', maxWidth: 420, mx: 'auto' }}>
        {icon ? (
          <Box sx={{ color: 'text.secondary', display: 'flex', '& > svg': { fontSize: 40 } }}>{icon}</Box>
        ) : null}
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: description ? 0.5 : 0 }}>
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {action}
      </Stack>
    </Box>
  );
}
