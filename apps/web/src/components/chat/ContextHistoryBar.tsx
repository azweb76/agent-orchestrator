import { Box, useTheme } from '@mui/material';
import type { TokenUsageBreakdown } from '@agent-orchestrator/shared';
import { share } from './contextUsageChart';

export function ContextFillBar({ usage, windowTokens }: { usage: TokenUsageBreakdown; windowTokens: number }) {
  const { cacheRead, cacheWrite, freshInput } = useTheme().palette.ao.chart;
  const cacheReadShare = share(usage.cacheReadInputTokens, windowTokens);
  const cacheWriteShare = share(usage.cacheCreationInputTokens, windowTokens);
  const fresh = share(usage.inputTokens, windowTokens);
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
      <Box sx={{ width: `${cacheReadShare}%`, bgcolor: cacheRead }} />
      <Box sx={{ width: `${cacheWriteShare}%`, bgcolor: cacheWrite }} />
      <Box sx={{ width: `${fresh}%`, bgcolor: freshInput }} />
    </Box>
  );
}
