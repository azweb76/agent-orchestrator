import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
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
const CHART_HEIGHT = 168;
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

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

/** Round up to 1 / 2 / 2.5 / 5 / 10 × 10^n so axis labels stay compact. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const mag = 10 ** exp;
  const n = value / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * mag;
}

function historyAxisMax(history: SessionContextTurn[], windowTokens: number): number {
  const peak = Math.max(0, ...history.map((turn) => turn.contextTokens));
  if (peak <= 0) return windowTokens;
  if (peak >= windowTokens * 0.28) return windowTokens;
  return Math.min(windowTokens, niceCeiling(peak * 1.12));
}

function barSlotWidth(count: number): number {
  if (count <= 8) return 32;
  if (count <= 20) return 22;
  if (count <= 40) return 16;
  return 12;
}

function shouldLabelTurn(turn: number, total: number): boolean {
  if (total <= 14) return true;
  if (turn === 1 || turn === total) return true;
  const step = total <= 28 ? 2 : total <= 56 ? 4 : Math.ceil(total / 12);
  return turn % step === 0;
}

function toolsLabel(tools: string[]): string {
  if (tools.length === 0) return '';
  return tools.length > 3 ? `${tools.slice(0, 3).join(', ')} +${tools.length - 3}` : tools.join(', ');
}

function HistoryBar({
  turn,
  yMax,
  windowTokens,
  selected,
  width,
  onSelect,
}: {
  turn: SessionContextTurn;
  yMax: number;
  windowTokens: number;
  selected: boolean;
  width: number;
  onSelect: () => void;
}) {
  const heightPct = share(turn.contextTokens, yMax);
  const occupancy = share(turn.contextTokens, windowTokens);
  const warnColor =
    occupancy >= 80 ? 'error.main' : occupancy >= 60 ? 'warning.main' : undefined;
  const label = `Turn ${turn.turn}: ${formatTokenCount(turn.contextTokens)} (${formatPercent(occupancy)})`;

  return (
    <Tooltip
      title={
        <Stack spacing={0.25}>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {label}
            {turn.compacted ? ' · Compacted' : ''}
          </Typography>
          {toolsLabel(turn.tools) ? (
            <Typography variant="caption">{toolsLabel(turn.tools)}</Typography>
          ) : null}
        </Stack>
      }
      placement="top"
      enterDelay={400}
    >
      <ButtonBase
        onClick={onSelect}
        aria-label={label}
        aria-pressed={selected}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
          width,
          minWidth: width,
          flexShrink: 0,
          height: CHART_HEIGHT + 14,
          px: 0.25,
          borderRadius: 0.75,
          bgcolor: selected ? 'rgba(139,164,255,0.12)' : 'transparent',
          outline: selected ? '2px solid' : 'none',
          outlineColor: 'primary.main',
          outlineOffset: -2,
          '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 0 },
        }}
      >
        <Box sx={{ height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {turn.compacted ? (
            <Box
              sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }}
              aria-hidden
            />
          ) : null}
        </Box>
        <Box
          sx={{
            height: CHART_HEIGHT,
            width: '100%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: '70%',
              maxWidth: 22,
              height: `${Math.max(heightPct, turn.contextTokens > 0 ? 2 : 0)}%`,
              minHeight: turn.contextTokens > 0 ? 3 : 0,
              display: 'flex',
              flexDirection: 'column-reverse',
              borderRadius: 0.5,
              overflow: 'hidden',
              boxShadow: warnColor ? 'inset 0 0 0 1px' : undefined,
              color: warnColor,
              bgcolor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Box sx={{ flexGrow: turn.usage.cacheReadInputTokens, minHeight: 0, bgcolor: CACHE_READ }} />
            <Box sx={{ flexGrow: turn.usage.cacheCreationInputTokens, minHeight: 0, bgcolor: CACHE_WRITE }} />
            <Box sx={{ flexGrow: turn.usage.inputTokens, minHeight: 0, bgcolor: FRESH_INPUT }} />
          </Box>
        </Box>
      </ButtonBase>
    </Tooltip>
  );
}

function HistoryChart({
  history,
  windowTokens,
}: {
  history: SessionContextTurn[];
  windowTokens: number;
}) {
  const yMax = useMemo(() => historyAxisMax(history, windowTokens), [history, windowTokens]);
  const latestTurn = history[history.length - 1]?.turn ?? 1;
  const [pinnedTurn, setPinnedTurn] = useState<number | null>(null);
  const selectedTurn =
    pinnedTurn != null &&
    pinnedTurn !== latestTurn &&
    history.some((turn) => turn.turn === pinnedTurn)
      ? pinnedTurn
      : latestTurn;
  const selected = history.find((turn) => turn.turn === selectedTurn) ?? history[history.length - 1];
  if (!selected) return null;
  const slotWidth = barSlotWidth(history.length);
  const occupancy = share(selected.contextTokens, windowTokens);
  const scaledToWindow = yMax === windowTokens;
  const hasCompact = history.some((turn) => turn.compacted);

  return (
    <Stack spacing={1}>
      <Box
        role="group"
        aria-label={`Context size per turn, ${history.length} ${history.length === 1 ? 'call' : 'calls'}`}
        sx={{ display: 'flex', gap: 1, minWidth: 0 }}
      >
        <Box
          sx={{
            position: 'relative',
            width: 40,
            flexShrink: 0,
            height: CHART_HEIGHT,
            mt: '14px',
          }}
          aria-hidden
        >
          {Y_TICKS.map((tick) => (
            <Typography
              key={tick}
              variant="caption"
              color="text.secondary"
              sx={{
                position: 'absolute',
                right: 0,
                bottom: `${tick * 100}%`,
                transform: 'translateY(50%)',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
                fontSize: 10,
              }}
            >
              {formatTokenCount(yMax * tick)}
            </Typography>
          ))}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Box sx={{ position: 'relative', minWidth: history.length * slotWidth }}>
            <Box sx={{ position: 'relative', height: CHART_HEIGHT, mt: '14px' }}>
              {Y_TICKS.map((tick) => (
                <Box
                  key={tick}
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${tick * 100}%`,
                    borderTop: 1,
                    borderColor: tick === 0 ? 'divider' : 'rgba(255,255,255,0.08)',
                    borderStyle: tick === 0 ? 'solid' : 'dashed',
                  }}
                  aria-hidden
                />
              ))}
            </Box>
            <Stack
              direction="row"
              sx={{ position: 'absolute', left: 0, right: 0, top: 0, height: CHART_HEIGHT + 14 }}
            >
              {history.map((turn) => (
                <HistoryBar
                  key={turn.turn}
                  turn={turn}
                  yMax={yMax}
                  windowTokens={windowTokens}
                  selected={turn.turn === selected.turn}
                  width={slotWidth}
                  onSelect={() => setPinnedTurn(turn.turn)}
                />
              ))}
            </Stack>
          </Box>
          <Stack direction="row" sx={{ minWidth: history.length * slotWidth, mt: 0.5 }}>
            {history.map((turn) => (
              <Typography
                key={turn.turn}
                variant="caption"
                color="text.secondary"
                sx={{
                  width: slotWidth,
                  minWidth: slotWidth,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 10,
                  lineHeight: 1.2,
                  visibility: shouldLabelTurn(turn.turn, history.length) ? 'visible' : 'hidden',
                }}
              >
                {turn.turn}
              </Typography>
            ))}
          </Stack>
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary">
        {scaledToWindow
          ? 'Context tokens per call versus the model window'
          : `Context tokens per call · axis to ${formatTokenCount(yMax)} of ${formatTokenCount(windowTokens)} window`}
        {hasCompact ? ' · yellow marks a compact' : ''}
      </Typography>

      {selected ? (
        <Stack
          spacing={0.5}
          sx={{
            px: 1.25,
            py: 1,
            borderRadius: 1,
            bgcolor: 'rgba(255,255,255,0.04)',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                Turn {selected.turn}
              </Typography>
              {selected.compacted ? (
                <Chip
                  size="small"
                  label="Compacted"
                  sx={{ height: 18, '& .MuiChip-label': { px: 0.6, fontSize: 10, fontWeight: 700 } }}
                />
              ) : null}
            </Stack>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {formatTokenCount(selected.contextTokens)}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5, fontWeight: 600 }}>
                {formatPercent(occupancy)}
              </Typography>
            </Typography>
          </Stack>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' },
              gap: 0.5,
            }}
          >
            <UsageLegendItem color={CACHE_READ} label="Cache read" tokens={selected.usage.cacheReadInputTokens} />
            <UsageLegendItem color={CACHE_WRITE} label="Cache write" tokens={selected.usage.cacheCreationInputTokens} />
            <UsageLegendItem color={FRESH_INPUT} label="Input" tokens={selected.usage.inputTokens} />
            <UsageLegendItem color="rgba(255,255,255,0.45)" label="Output" tokens={selected.usage.outputTokens} />
          </Box>
          {selected.tools.length > 0 ? (
            <Typography variant="caption" color="text.secondary">
              {toolsLabel(selected.tools)}
            </Typography>
          ) : null}
        </Stack>
      ) : null}
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
          <HistoryChart history={data.history} windowTokens={data.contextWindowTokens} />
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

      <ResponsiveDialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
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
