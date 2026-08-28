import { Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import type { SessionContextUsage } from '@agent-orchestrator/shared';
import { CACHE_READ, CACHE_WRITE, FRESH_INPUT, percentChipColor, percentFillColor } from './contextUsageColors';
import { ContextFillBar } from './ContextHistoryBar';
import { ContextHistoryChart } from './ContextHistoryChart';
import { ContextUsageLegendItem } from './ContextUsageLegend';
import { formatPercent, formatTokenCount } from './contextUsageChart';

export function ContextUsageBody({ data }: { data: SessionContextUsage }) {
  const hasUsage = data.currentContextTokens > 0 && data.usage;
  const color = percentChipColor(data.percent);
  const fill = percentFillColor(data.percent);
  const remaining = Math.max(0, data.compactThresholdTokens - data.currentContextTokens);

  return (
    <Stack spacing={2.25} sx={{ mt: 0.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography variant="h5" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatTokenCount(data.currentContextTokens)}
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75, fontWeight: 600 }}>
              / {formatTokenCount(data.compactThresholdTokens)}
            </Typography>
          </Typography>
          <Chip size="small" color={color} label={formatPercent(data.percent)} />
        </Stack>
        <LinearProgress
          variant="determinate"
          value={data.percent ?? 0}
          sx={{
            height: 8,
            borderRadius: 1,
            bgcolor: 'ao.surface.codeInline',
            '& .MuiLinearProgress-bar': { bgcolor: fill, borderRadius: 1 },
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {data.model ? `${data.model} · ` : ''}
          {data.currentContextTokens > 0
            ? remaining === 0
              ? `At auto-compact threshold · ${formatTokenCount(data.contextWindowTokens)} window`
              : `${formatTokenCount(remaining)} until auto-compact · ${formatTokenCount(data.contextWindowTokens)} window`
            : `Auto-compact at ${formatTokenCount(data.compactThresholdTokens)} of the ${formatTokenCount(data.contextWindowTokens)} window`}
        </Typography>
      </Stack>

      {hasUsage ? (
        <Stack spacing={1}>
          <Typography variant="subtitle2">Usage</Typography>
          <ContextFillBar usage={data.usage!} windowTokens={data.compactThresholdTokens} />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' },
              gap: 0.75,
            }}
          >
            <ContextUsageLegendItem color={CACHE_READ} label="Cache read" tokens={data.usage!.cacheReadInputTokens} />
            <ContextUsageLegendItem color={CACHE_WRITE} label="Cache write" tokens={data.usage!.cacheCreationInputTokens} />
            <ContextUsageLegendItem color={FRESH_INPUT} label="Input" tokens={data.usage!.inputTokens} />
            <ContextUsageLegendItem color="ao.chart.muted" label="Output" tokens={data.usage!.outputTokens} />
          </Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`${formatTokenCount(
                data.billed.inputTokens +
                  data.billed.outputTokens +
                  data.billed.cacheCreationInputTokens +
                  data.billed.cacheReadInputTokens,
              )} tokens across calls`}
            />
            {data.costUsd != null ? (
              <Chip size="small" label={`$${data.costUsd.toFixed(data.costUsd < 0.1 ? 4 : 2)}`} />
            ) : null}
            <Chip size="small" label={`${data.history.length} ${data.history.length === 1 ? 'call' : 'calls'}`} />
          </Stack>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Context usage appears after Claude replies. Size is the prompt tokens reported on each model call.
        </Typography>
      )}

      <Stack spacing={0.5}>
        <Typography variant="subtitle2">History</Typography>
        {data.history.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No context history yet.
          </Typography>
        ) : (
          <ContextHistoryChart history={data.history} maxTokens={data.compactThresholdTokens} />
        )}
      </Stack>
    </Stack>
  );
}
