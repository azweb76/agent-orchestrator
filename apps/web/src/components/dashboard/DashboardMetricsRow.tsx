import { Box } from '@mui/material';
import { formatUsd } from '../../utils/format';
import { MetricTile } from './MetricTile';
import type { SystemStatus } from '../../api/client';
import type { UsageSummary } from '@agent-orchestrator/shared';

interface DashboardMetricsRowProps {
  runningCount: number;
  orchestratorProcessCount: number;
  externalProcessCount: number;
  idleCount: number;
  workspaceCount: number;
  prCount: number;
  githubConfigured: boolean;
  usage?: UsageSummary;
  status?: SystemStatus;
  boardingCount?: number;
  airborneCount?: number;
  approachCount?: number;
  landedCount?: number;
}

export function DashboardMetricsRow({
  runningCount,
  orchestratorProcessCount,
  externalProcessCount,
  idleCount,
  workspaceCount,
  prCount,
  githubConfigured,
  usage,
  boardingCount,
  airborneCount,
  approachCount,
  landedCount,
}: DashboardMetricsRowProps) {
  const useFlightMetrics =
    boardingCount != null && airborneCount != null && approachCount != null && landedCount != null;

  if (useFlightMetrics) {
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'ao.surface.panelMuted',
          overflow: 'hidden',
          '& > *:nth-of-type(odd)': {
            borderRight: { xs: '1px solid', md: 'none' },
            borderColor: 'divider',
          },
          '& > *:nth-of-type(n + 3)': {
            borderTop: { xs: '1px solid', md: 'none' },
            borderColor: 'divider',
          },
          '& > * + *': {
            borderLeft: { md: '1px solid' },
            borderColor: 'divider',
          },
        }}
      >
        <MetricTile
          label="Boarding"
          value={boardingCount}
          hint="Planning · luggage"
          accent="warning.main"
        />
        <MetricTile
          label="Airborne"
          value={airborneCount}
          hint={`${runningCount} procs · ${idleCount} ready`}
          accent="info.main"
        />
        <MetricTile
          label="On approach"
          value={approachCount}
          hint={githubConfigured ? `${prCount} open PRs` : 'Verifying'}
          accent="secondary.main"
        />
        <MetricTile label="Landed" value={landedCount} hint="Merged PRs" accent="success.main" />
        <MetricTile
          label="Spend today"
          value={usage ? formatUsd(usage.todayCostUsd) : '—'}
          hint={
            usage?.budget.dailyCapUsd != null
              ? `${formatUsd(usage.budget.remainingDailyUsd ?? 0)} left today · ${formatUsd(usage.totalCostUsd)} all-time`
              : usage
                ? `${formatUsd(usage.totalCostUsd)} all-time`
                : 'Loading…'
          }
          accent="warning.main"
        />
      </Box>
    );
  }

  const runningHint =
    runningCount === 0
      ? 'No Claude processes'
      : `${orchestratorProcessCount} orchestrator · ${externalProcessCount} external`;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'ao.surface.panelMuted',
        overflow: 'hidden',
        '& > *:nth-of-type(odd)': {
          borderRight: { xs: '1px solid', md: 'none' },
          borderColor: 'divider',
        },
        '& > *:nth-of-type(n + 3)': {
          borderTop: { xs: '1px solid', md: 'none' },
          borderColor: 'divider',
        },
        '& > * + *': {
          borderLeft: { md: '1px solid' },
          borderColor: 'divider',
        },
      }}
    >
      <MetricTile label="Running" value={runningCount} hint={runningHint} accent="info.main" />
      <MetricTile label="Ready" value={idleCount} hint="Idle agents" accent="success.main" />
      <MetricTile label="Workspaces" value={workspaceCount} hint="Local repos" />
      <MetricTile
        label="Open PRs"
        value={githubConfigured ? prCount : '—'}
        hint={githubConfigured ? 'Authored + reviews' : 'GitHub not connected'}
        accent="secondary.main"
      />
      <MetricTile
        label="Spend today"
        value={usage ? formatUsd(usage.todayCostUsd) : '—'}
        hint={
          usage?.budget.dailyCapUsd != null
            ? `${formatUsd(usage.budget.remainingDailyUsd ?? 0)} left today · ${formatUsd(usage.totalCostUsd)} all-time`
            : usage
              ? `${formatUsd(usage.totalCostUsd)} all-time`
              : 'Loading…'
        }
        accent="warning.main"
      />
    </Box>
  );
}
