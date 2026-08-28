import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import type { InboxPullRequest, UsageSummary, WorkspaceWithCounts } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { formatBytes, formatUsd } from '../../utils/format';
import { pullRequestPath } from '../../utils/paths';
import type { SystemStatus } from '../../api/client';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';

interface DashboardSidePanelsProps {
  status?: SystemStatus;
  runningCount: number;
  activeAgentCount: number;
  archivedCount: number;
  onPruneClick: () => void;
  usage?: UsageSummary;
  workspacesLoading: boolean;
  recentWorkspaces: WorkspaceWithCounts[];
  githubConfigured: boolean;
  inboxLoading: boolean;
  recentPrs: InboxPullRequest[];
}

export function DashboardSidePanels({
  status,
  runningCount,
  activeAgentCount,
  archivedCount,
  onPruneClick,
  usage,
  workspacesLoading,
  recentWorkspaces,
  githubConfigured,
  inboxLoading,
  recentPrs,
}: DashboardSidePanelsProps) {
  return (
    <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
      <HudPanel>
        <SectionLabel>Systems</SectionLabel>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Readiness
        </Typography>
        <Stack spacing={1.25}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">Claude Code</Typography>
            <Chip
              size="small"
              label={status?.claudeInstalled ? 'Online' : 'Missing'}
              color={status?.claudeInstalled ? 'success' : 'warning'}
              variant="outlined"
            />
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">GitHub</Typography>
            <Chip
              size="small"
              label={status?.githubTokenConfigured ? 'Connected' : 'No token'}
              color={status?.githubTokenConfigured ? 'success' : 'default'}
              variant="outlined"
            />
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">Fleet</Typography>
            <Chip
              size="small"
              label={
                runningCount > 0 ? 'Engaged' : activeAgentCount > 0 ? 'Standing by' : 'Empty'
              }
              color={runningCount > 0 ? 'info' : 'default'}
              variant="outlined"
            />
          </Stack>
          {archivedCount > 0 ? (
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2">Archived</Typography>
              <Chip
                size="small"
                label={`${archivedCount} to prune`}
                color="warning"
                variant="outlined"
                onClick={onPruneClick}
                sx={{ cursor: 'pointer' }}
              />
            </Stack>
          ) : null}
          {typeof status?.dataDirBytes === 'number' ? (
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2">Data directory</Typography>
              <Chip size="small" label={formatBytes(status.dataDirBytes)} variant="outlined" />
            </Stack>
          ) : null}
        </Stack>
      </HudPanel>

      {usage && usage.agents.length > 0 ? (
        <HudPanel>
          <Stack
            direction="row"
            sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}
          >
            <Box>
              <SectionLabel>Usage</SectionLabel>
              <Typography variant="h6">Top spend</Typography>
            </Box>
            <Typography
              variant="caption"
              sx={{ fontFamily: '"IBM Plex Mono", monospace', color: 'text.secondary' }}
            >
              {formatUsd(usage.totalCostUsd)} · {usage.totalAssistantTurns} turns
            </Typography>
          </Stack>
          <Stack spacing={0}>
            {usage.agents.slice(0, 5).map((agent) => (
              <Box
                key={agent.agentId}
                component={RouterLink}
                to={`/agents/${agent.agentId}`}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 1,
                  textDecoration: 'none',
                  color: 'inherit',
                  py: 0.9,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                  '&:hover .usage-name': { color: 'secondary.main' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography className="usage-name" variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {agent.agentName}
                    {agent.archived ? ' (archived)' : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {agent.workspaceName} · {agent.assistantTurns} turns
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    color: 'warning.main',
                    flexShrink: 0,
                    alignSelf: 'center',
                  }}
                >
                  {formatUsd(agent.costUsd)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </HudPanel>
      ) : null}

      <HudPanel>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Box>
            <SectionLabel>Repositories</SectionLabel>
            <Typography variant="h6">Workspaces</Typography>
          </Box>
          <ControlTooltip title="View all workspaces">
            <Button component={RouterLink} to="/workspaces" size="small">
              View all
            </Button>
          </ControlTooltip>
        </Stack>

        {workspacesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : recentWorkspaces.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No workspaces yet. Clone a repo to begin.
          </Typography>
        ) : (
          <Stack spacing={0}>
            {recentWorkspaces.map((workspace) => (
              <Box
                key={workspace.id}
                component={RouterLink}
                to={`/workspaces/${workspace.id}`}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 1,
                  textDecoration: 'none',
                  color: 'inherit',
                  py: 0.9,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                  '&:hover .ws-name': { color: 'secondary.main' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography className="ws-name" variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {workspace.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {workspace.githubOwner}/{workspace.githubRepo}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    color: 'text.secondary',
                    flexShrink: 0,
                  }}
                >
                  {workspace.agentCount}a · {workspace.worktreeCount}w
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </HudPanel>

      <HudPanel>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Box>
            <SectionLabel>Inbox</SectionLabel>
            <Typography variant="h6">Pull requests</Typography>
          </Box>
          <ControlTooltip title="Open the full pull request inbox">
            <Button component={RouterLink} to="/pull-requests" size="small">
              Open inbox
            </Button>
          </ControlTooltip>
        </Stack>

        {!githubConfigured ? (
          <Typography color="text.secondary" variant="body2">
            Set <code>GITHUB_TOKEN</code> to load your PR inbox.
          </Typography>
        ) : inboxLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : recentPrs.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No open authored PRs or review requests.
          </Typography>
        ) : (
          <Stack spacing={0}>
            {recentPrs.map((pr) => (
              <Box
                key={`${pr.owner}/${pr.repo}#${pr.number}`}
                component={RouterLink}
                to={pullRequestPath(pr.owner, pr.repo, pr.number)}
                sx={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  py: 0.9,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                  '&:hover .pr-title': { color: 'secondary.main' },
                }}
              >
                <Typography className="pr-title" variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  #{pr.number} {pr.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {pr.owner}/{pr.repo} · {pr.category === 'authored' ? 'authored' : 'review'}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </HudPanel>
    </Stack>
  );
}
