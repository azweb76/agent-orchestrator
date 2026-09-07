import { useMemo, useState } from 'react';
import { Box, ButtonBase, Chip, Stack, Typography, useTheme } from '@mui/material';
import type { SessionContextBranch, SessionContextTurn } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { percentFillColor } from './contextUsageColors';
import { ContextUsageLegendItem } from './ContextUsageLegend';
import { subagentTypeLabel } from './toolPresentation';
import {
  barSlotWidth,
  branchesByParentTurn,
  branchPeakContextTokens,
  CHART_HEIGHT,
  formatPercent,
  formatTokenCount,
  historyAxisMax,
  share,
  shouldLabelTurn,
  toolsLabel,
  Y_TICKS,
} from './contextUsageChart';

function branchLabel(branch: SessionContextBranch): string {
  return subagentTypeLabel(branch.subagentType ?? undefined) ?? 'Subagent';
}

function HistoryBar({
  turn,
  yMax,
  maxTokens,
  selected,
  width,
  branches,
  onSelect,
}: {
  turn: SessionContextTurn;
  yMax: number;
  maxTokens: number;
  selected: boolean;
  width: number;
  branches: SessionContextBranch[];
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
        <Box sx={{ height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4, flexShrink: 0 }}>
          {turn.compacted ? (
            <Box
              sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }}
              aria-hidden
            />
          ) : null}
          {branches.length > 0 ? (
            <ControlTooltip
              title={`Spawned: ${branches.map(branchLabel).join(', ')}`}
              placement="top"
              enterDelay={400}
            >
              <Box
                aria-hidden
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '1px',
                  bgcolor: 'secondary.main',
                  transform: 'rotate(45deg)',
                }}
              />
            </ControlTooltip>
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
  branches = [],
}: {
  history: SessionContextTurn[];
  maxTokens: number;
  branches?: SessionContextBranch[];
}) {
  const { cacheRead, cacheWrite, freshInput } = useTheme().palette.ao.chart;
  const yMax = useMemo(() => historyAxisMax(history, maxTokens), [history, maxTokens]);
  const branchMap = useMemo(() => branchesByParentTurn(branches), [branches]);
  const latestTurn = history[history.length - 1]?.turn ?? 1;
  const [pinnedTurn, setPinnedTurn] = useState<number | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
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
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;

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
                  branches={branchMap.get(turn.turn) ?? []}
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
          {branches.length > 0 ? (
            <Stack direction="row" sx={{ minWidth: history.length * slotWidth, mt: 0.5 }}>
              {history.map((turn) => {
                const turnBranches = branchMap.get(turn.turn) ?? [];
                const first = turnBranches[0];
                return (
                  <Box
                    key={turn.turn}
                    sx={{ width: slotWidth, minWidth: slotWidth, display: 'flex', justifyContent: 'center' }}
                  >
                    {first ? (
                      <ButtonBase
                        disableRipple
                        onClick={() => setSelectedBranchId(first.id)}
                        aria-label={`Branch: ${branchLabel(first)}`}
                        aria-pressed={selectedBranchId === first.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.25,
                          maxWidth: '100%',
                          px: 0.4,
                          borderRadius: 0.5,
                          fontSize: 9,
                          color: 'secondary.main',
                          bgcolor: selectedBranchId === first.id ? 'ao.accent.primaryTintStrong' : 'transparent',
                          '&:hover': { bgcolor: 'ao.surface.hover' },
                        }}
                      >
                        <Box sx={{ width: 6, height: 1, bgcolor: 'secondary.main', flexShrink: 0 }} aria-hidden />
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: 9,
                            lineHeight: 1.2,
                            color: 'inherit',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: slotWidth,
                          }}
                        >
                          {branchLabel(first)}
                          {turnBranches.length > 1 ? ` +${turnBranches.length - 1}` : ''}
                        </Typography>
                      </ButtonBase>
                    ) : null}
                  </Box>
                );
              })}
            </Stack>
          ) : null}
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

      {selectedBranch ? (
        <Box
          sx={{
            borderLeft: 3,
            borderColor: 'secondary.main',
            pl: 1.25,
            py: 1,
            borderRadius: 1,
            bgcolor: 'ao.surface.hover',
          }}
        >
          <Stack spacing={0.75}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">
                ↳ {branchLabel(selectedBranch)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {selectedBranch.history.length} {selectedBranch.history.length === 1 ? 'call' : 'calls'} · peak{' '}
                {formatTokenCount(branchPeakContextTokens(selectedBranch))}
              </Typography>
            </Stack>
            {selectedBranch.description ? (
              <Typography variant="body2">{selectedBranch.description}</Typography>
            ) : null}
            {selectedBranch.history.length > 0 ? (
              <ContextHistoryChart history={selectedBranch.history} maxTokens={maxTokens} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                No context history captured for this subagent.
              </Typography>
            )}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
