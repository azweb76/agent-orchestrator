import { Box, Stack, Typography } from '@mui/material';
import { formatTokenCount } from './contextUsageChart';

export function ContextUsageLegendItem({
  color,
  label,
  tokens,
}: {
  color: string;
  label: string;
  tokens: number;
}) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
        {label} {formatTokenCount(tokens)}
      </Typography>
    </Stack>
  );
}
