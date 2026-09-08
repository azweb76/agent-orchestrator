import { Box, Stack, Typography, useTheme } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import {
  CONTEXT_ATTRIBUTION_LABELS,
  type ContextAttributionKey,
  type SessionContextAttribution,
} from '@agent-orchestrator/shared';
import { ContextUsageLegendItem } from './ContextUsageLegend';
import { share } from './contextUsageChart';

const ATTRIBUTION_COLOR_KEY: Record<
  ContextAttributionKey,
  keyof Theme['palette']['ao']['chart']['attribution']
> = {
  conversation: 'conversation',
  tool_results: 'toolResults',
  skills: 'skills',
  instruction_files: 'instructionFiles',
  memory: 'memory',
  other: 'other',
};

export function attributionFillColor(theme: Theme, key: ContextAttributionKey): string {
  return theme.palette.ao.chart.attribution[ATTRIBUTION_COLOR_KEY[key]];
}

export function ContextAttributionBar({
  attribution,
  windowTokens,
}: {
  attribution: SessionContextAttribution;
  windowTokens: number;
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        height: 10,
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'ao.surface.codeInline',
      }}
      aria-hidden
    >
      {attribution.buckets.map((bucket) => (
        <Box
          key={bucket.key}
          sx={{
            width: `${share(bucket.tokens, windowTokens)}%`,
            bgcolor: attributionFillColor(theme, bucket.key),
          }}
        />
      ))}
    </Box>
  );
}

export function ContextAttributionSection({
  attribution,
  windowTokens,
}: {
  attribution: SessionContextAttribution;
  windowTokens: number;
}) {
  const theme = useTheme();
  const visible = attribution.buckets.filter((bucket) => bucket.tokens > 0);
  if (visible.length === 0) return null;
  const largestLabel = attribution.largest ? CONTEXT_ATTRIBUTION_LABELS[attribution.largest] : null;

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">In context</Typography>
      <ContextAttributionBar attribution={attribution} windowTokens={windowTokens} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 0.75,
        }}
      >
        {visible.map((bucket) => (
          <ContextUsageLegendItem
            key={bucket.key}
            color={attributionFillColor(theme, bucket.key)}
            label={CONTEXT_ATTRIBUTION_LABELS[bucket.key]}
            tokens={bucket.tokens}
          />
        ))}
      </Box>
      {attribution.cutHint ? (
        <Typography variant="body2" color="text.secondary">
          {largestLabel ? `${largestLabel} is the largest slice. ` : ''}
          {attribution.cutHint}
        </Typography>
      ) : null}
    </Stack>
  );
}
