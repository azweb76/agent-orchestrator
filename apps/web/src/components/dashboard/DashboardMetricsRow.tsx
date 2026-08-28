import { Box } from '@mui/material';
import { formatUsd } from '../../utils/format';
import { MetricTile } from './MetricTile';
import type { SystemStatus } from '../../api/client';
import type { UsageSummary } from '@agent-orchestrator/shared';

interface DashboardMetricsRowProps {
  runningCount: number;
  idleCount: number;
  workspaceCount: number;
  prCount: number;
  githubConfigured: boolean;
  usage?: UsageSummary;
  status?: SystemStatus;
}

export function DashboardMetricsRow({
  runningCount,
  idleCount,
  workspaceCount,
  prCount,
  githubConfigured,
  usage,
}: DashboardMetricsRowProps) {
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
      <MetricTile label="Running" value={runningCount} hint="Active runs" accent="info.main" />
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
        hint={usage ? `${formatUsd(usage.totalCostUsd)} all-time` : 'Loading…'}
        accent="warning.main"
      />
    </Box>
  );
}
