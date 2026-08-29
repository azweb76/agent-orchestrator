import { useMemo, useState } from 'react';
import { Box, ButtonBase, Chip, Stack, Typography, useTheme } from '@mui/material';
import type { SessionContextTurn } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { percentFillColor } from './contextUsageColors';
import { ContextUsageLegendItem } from './ContextUsageLegend';
import {
  barSlotWidth,
  CHART_HEIGHT,
  formatPercent,
  formatTokenCount,
  historyAxisMax,
  share,
  shouldLabelTurn,
  toolsLabel,
  Y_TICKS,
} from './contextUsageChart';

function HistoryBar({
  turn,
  yMax,
  maxTokens,
  selected,
  width,
  onSelect,
}: {
  turn: SessionContextTurn;
  yMax: number;
  maxTokens: number;
  selected: boolean;
  width: number;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const { cacheRead, cacheWrite, freshInput } = theme.palette.ao.chart;
  const heightPct = share(turn.contextTokens, yMax);
  const occupancy = share(turn.contextTokens, maxTokens);
  const occupancyColor = occupancy >= 50 ? percentFillColor(occupancy, theme.palette.mode) : undefined;
  const label = `Turn ${turn.turn}: ${formatTokenCount(turn.contextTokens)} (${formatPercent(occupancy)})`;

  return (
    <ControlTooltip
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
        disableRipple
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
          bgcolor: selected ? 'ao.accent.primaryTintStrong' : 'transparent',
          outline: selected ? '2px solid' : 'none',
          outlineColor: 'primary.main',
          outlineOffset: -2,
          '&:hover': { bgcolor: 'ao.surface.hover' },
          '&:focus': { outline: 'none' },
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
              boxShadow: occupancyColor ? 'inset 0 0 0 1px' : undefined,
              color: occupancyColor,
              bgcolor: 'ao.surface.codeInline',
            }}
          >
            <Box sx={{ flexGrow: turn.usage.cacheReadInputTokens, minHeight: 0, bgcolor: cacheRead }} />
            <Box sx={{ flexGrow: turn.usage.cacheCreationInputTokens, minHeight: 0, bgcolor: cacheWrite }} />
            <Box sx={{ flexGrow: turn.usage.inputTokens, minHeight: 0, bgcolor: freshInput }} />
          </Box>
        </Box>
      </ButtonBase>
    </ControlTooltip>
  );
}

export function ContextHistoryChart({
  history,
  maxTokens,
}: {
  history: SessionContextTurn[];
  maxTokens: number;
}) {
  const { cacheRead, cacheWrite, freshInput } = useTheme().palette.ao.chart;
  const yMax = useMemo(() => historyAxisMax(history, maxTokens), [history, maxTokens]);
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
  const occupancy = share(selected.contextTokens, maxTokens);
  const scaledToMax = yMax === maxTokens;
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
                transform: tick === 0 ? 'none' : tick === 1 ? 'translateY(-100%)' : 'translateY(50%)',
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
                    borderColor: tick === 0 ? 'divider' : 'ao.surface.hover',
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
                  maxTokens={maxTokens}
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
        {scaledToMax
          ? 'Context tokens per call versus auto-compact'
          : `Context tokens per call · axis to ${formatTokenCount(yMax)} of ${formatTokenCount(maxTokens)} compact`}
        {hasCompact ? ' · yellow marks a compact' : ''}
      </Typography>

      {selected ? (
        <Stack
          spacing={0.5}
          sx={{
            px: 1.25,
            py: 1,
            borderRadius: 1,
            bgcolor: 'ao.surface.hover',
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
            <ContextUsageLegendItem color={cacheRead} label="Cache read" tokens={selected.usage.cacheReadInputTokens} />
            <ContextUsageLegendItem color={cacheWrite} label="Cache write" tokens={selected.usage.cacheCreationInputTokens} />
            <ContextUsageLegendItem color={freshInput} label="Input" tokens={selected.usage.inputTokens} />
            <ContextUsageLegendItem color="ao.chart.muted" label="Output" tokens={selected.usage.outputTokens} />
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
