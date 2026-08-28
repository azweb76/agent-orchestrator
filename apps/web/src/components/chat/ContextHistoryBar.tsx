import { Box } from '@mui/material';
import type { TokenUsageBreakdown } from '@agent-orchestrator/shared';
import { CACHE_READ, CACHE_WRITE, FRESH_INPUT } from './contextUsageColors';
import { share } from './contextUsageChart';

export function ContextFillBar({ usage, windowTokens }: { usage: TokenUsageBreakdown; windowTokens: number }) {
  const cacheRead = share(usage.cacheReadInputTokens, windowTokens);
  const cacheWrite = share(usage.cacheCreationInputTokens, windowTokens);
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
      <Box sx={{ width: `${cacheRead}%`, bgcolor: CACHE_READ }} />
      <Box sx={{ width: `${cacheWrite}%`, bgcolor: CACHE_WRITE }} />
      <Box sx={{ width: `${fresh}%`, bgcolor: FRESH_INPUT }} />
    </Box>
  );
}
