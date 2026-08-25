import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

export interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <Stack spacing={1.5} sx={{ mb: 0.5 }}>
      {breadcrumbs}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {eyebrow ? (
            <Typography
              variant="caption"
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'secondary.main',
                display: 'block',
                mb: 0.75,
              }}
            >
              {eyebrow}
            </Typography>
          ) : null}
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              letterSpacing: '-0.02em',
              fontSize: { xs: '1.5rem', md: '1.85rem' },
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>
          {description ? (
            <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 640, lineHeight: 1.5 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {actions ? (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}
          >
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
