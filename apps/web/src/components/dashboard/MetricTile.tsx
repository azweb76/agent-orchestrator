import { Box, Typography } from '@mui/material';

export function MetricTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: { xs: 0, sm: 110 },
        py: 1.5,
        px: { xs: 1.5, sm: 2 },
        borderLeft: '2px solid',
        borderColor: accent ?? 'secondary.main',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontFamily: '"IBM Plex Mono", monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          display: 'block',
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="h4"
        sx={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontWeight: 600,
          lineHeight: 1.1,
          color: accent ?? 'text.primary',
          fontSize: { xs: '1.5rem', sm: '2rem' },
        }}
      >
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}
