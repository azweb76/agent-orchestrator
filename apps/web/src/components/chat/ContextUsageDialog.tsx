import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { SessionContextTurn, SessionContextUsage, TokenUsageBreakdown } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { formatTokenCount } from '../../utils/format';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';

interface ContextUsageButtonProps {
  agentId: string;
  sessionId: string;
  isStreaming?: boolean;
}

const CACHE_READ = '#5eead4';
const CACHE_WRITE = '#8ba4ff';
const FRESH_INPUT = '#ffb74d';

function percentColor(percent: number | null): 'secondary' | 'warning' | 'error' {
  if (percent == null) return 'secondary';
  if (percent >= 80) return 'error';
  if (percent >= 60) return 'warning';
  return 'secondary';
}

function formatPercent(percent: number | null): string {
  if (percent == null) return '—';
  if (percent < 1) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

function share(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  return Math.min(100, (part / whole) * 100);
}

function UsageLegendItem({
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

function ContextFillBar({ usage, windowTokens }: { usage: TokenUsageBreakdown; windowTokens: number }) {
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
        bgcolor: 'rgba(255,255,255,0.08)',
      }}
      aria-hidden
    >
      <Box sx={{ width: `${cacheRead}%`, bgcolor: CACHE_READ }} />
      <Box sx={{ width: `${cacheWrite}%`, bgcolor: CACHE_WRITE }} />
      <Box sx={{ width: `${fresh}%`, bgcolor: FRESH_INPUT }} />
    </Box>
  );
}

function HistoryRow({
  turn,
  windowTokens,
}: {
  turn: SessionContextTurn;
  windowTokens: number;
}) {
  const fill = share(turn.contextTokens, windowTokens);
  return (
    <Stack spacing={0.4} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {turn.turn}
          </Typography>
          {turn.compacted ? (
            <Chip
              size="small"
              label="Compacted"
              sx={{ height: 18, '& .MuiChip-label': { px: 0.6, fontSize: 10, fontWeight: 700 } }}
            />
          ) : null}
          {turn.tools.length > 0 ? (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {turn.tools.slice(0, 3).join(', ')}
              {turn.tools.length > 3 ? ` +${turn.tools.length - 3}` : ''}
            </Typography>
          ) : null}
        </Stack>
        <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {formatTokenCount(turn.contextTokens)}
        </Typography>
      </Stack>
      <Box
        sx={{
          height: 4,
          borderRadius: 1,
          bgcolor: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ width: `${fill}%`, height: '100%', bgcolor: percentColor(fill) === 'error' ? 'error.main' : percentColor(fill) === 'warning' ? 'warning.main' : 'secondary.main' }} />
      </Box>
    </Stack>
  );
}

function ContextUsageBody({ data }: { data: SessionContextUsage }) {
  const hasUsage = data.currentContextTokens > 0 && data.usage;
  const color = percentColor(data.percent);

  return (
    <Stack spacing={2.25} sx={{ mt: 0.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography variant="h5" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatTokenCount(data.currentContextTokens)}
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75, fontWeight: 600 }}>
              / {formatTokenCount(data.contextWindowTokens)}
            </Typography>
          </Typography>
          <Chip size="small" color={color} label={formatPercent(data.percent)} />
        </Stack>
        <LinearProgress
          variant="determinate"
          value={data.percent ?? 0}
          color={color}
          sx={{ height: 8, borderRadius: 1 }}
        />
        <Typography variant="caption" color="text.secondary">
          {data.model ? `${data.model} · ` : ''}
          Current prompt size versus the model context window
        </Typography>
      </Stack>

      {hasUsage ? (
        <Stack spacing={1}>
          <Typography variant="subtitle2">Usage</Typography>
          <ContextFillBar usage={data.usage!} windowTokens={data.contextWindowTokens} />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' },
              gap: 0.75,
            }}
          >
            <UsageLegendItem color={CACHE_READ} label="Cache read" tokens={data.usage!.cacheReadInputTokens} />
            <UsageLegendItem color={CACHE_WRITE} label="Cache write" tokens={data.usage!.cacheCreationInputTokens} />
            <UsageLegendItem color={FRESH_INPUT} label="Input" tokens={data.usage!.inputTokens} />
            <UsageLegendItem color="rgba(255,255,255,0.45)" label="Output" tokens={data.usage!.outputTokens} />
          </Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`Session ${formatTokenCount(
                data.billed.inputTokens +
                  data.billed.outputTokens +
                  data.billed.cacheCreationInputTokens +
                  data.billed.cacheReadInputTokens,
              )} billed tokens`}
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
          <Box sx={{ maxHeight: { xs: 'none', sm: 320 }, overflowY: 'auto' }}>
            {data.history.map((turn) => (
              <HistoryRow key={turn.turn} turn={turn} windowTokens={data.contextWindowTokens} />
            ))}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}

export function ContextUsageButton({ agentId, sessionId, isStreaming }: ContextUsageButtonProps) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['session-context', agentId, sessionId],
    queryFn: () => api.getSessionContext(agentId, sessionId),
    enabled: Boolean(agentId && sessionId),
    refetchInterval: isStreaming || open ? 2000 : false,
    staleTime: 4_000,
  });

  const data = query.data;
  const percent = data?.percent ?? null;
  const color = percentColor(percent);
  const label =
    data && data.currentContextTokens > 0
      ? `${formatTokenCount(data.currentContextTokens)} · ${formatPercent(percent)}`
      : 'Context';

  return (
    <>
      <Tooltip title="Context usage">
        <span>
          <Button
            size="small"
            color={color}
            variant="text"
            disabled={!sessionId}
            onClick={() => setOpen(true)}
            aria-label={`Context usage ${label}`}
            sx={{
              minWidth: 0,
              px: 0.75,
              py: 0.25,
              fontSize: 12,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: color === 'secondary' ? 'text.secondary' : undefined,
            }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  width: 22,
                  height: 4,
                  borderRadius: 1,
                  bgcolor: 'rgba(255,255,255,0.12)',
                  overflow: 'hidden',
                  display: { xs: 'none', sm: 'block' },
                }}
              >
                <Box
                  sx={{
                    width: `${percent ?? 0}%`,
                    height: '100%',
                    bgcolor: color === 'error' ? 'error.main' : color === 'warning' ? 'warning.main' : 'secondary.main',
                  }}
                />
              </Box>
              {label}
            </Stack>
          </Button>
        </span>
      </Tooltip>

      <ResponsiveDialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Context usage</DialogTitle>
        {query.isFetching ? <LinearProgress sx={{ mt: -1 }} /> : null}
        <DialogContent>
          {query.isPending && !data ? (
            <Stack spacing={1.25} sx={{ alignItems: 'center', py: 4 }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Reading session usage…
              </Typography>
            </Stack>
          ) : null}
          {query.error ? (
            <Alert severity="error">{(query.error as Error).message}</Alert>
          ) : null}
          {data ? <ContextUsageBody data={data} /> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </ResponsiveDialog>
    </>
  );
}
