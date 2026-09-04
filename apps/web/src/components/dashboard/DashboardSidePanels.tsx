import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import type {
  InboxIssue,
  InboxJiraIssue,
  InboxPullRequest,
  UsageSummary,
  WorkspaceWithCounts,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { formatUsd } from '../../utils/format';
import { pullRequestPath } from '../../utils/paths';
import type { SystemStatus } from '../../api/client';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';
import { PullRequestStatusIcon } from '../pr/PullRequestStatusIcon';
import { resolvePullRequestStatus } from '../pr/pullRequestStatus';
import { DashboardGithubIssuesPanel, DashboardJiraIssuesPanel } from './DashboardIssueInboxes';

interface DashboardSidePanelsProps {
  status?: SystemStatus;
  archivedCount: number;
  onPruneClick: () => void;
  usage?: UsageSummary;
  workspacesLoading: boolean;
  recentWorkspaces: WorkspaceWithCounts[];
  githubConfigured: boolean;
  jiraConfigured: boolean;
  inboxLoading: boolean;
  recentPrs: InboxPullRequest[];
  issuesLoading: boolean;
  recentIssues: InboxIssue[];
  jiraIssuesLoading: boolean;
  recentJiraIssues: InboxJiraIssue[];
  workspaces?: WorkspaceWithCounts[];
}

export function DashboardSidePanels({
  status,
  archivedCount,
  onPruneClick,
  usage,
  workspacesLoading,
  recentWorkspaces,
  githubConfigured,
  jiraConfigured,
  inboxLoading,
  recentPrs,
  issuesLoading,
  recentIssues,
  jiraIssuesLoading,
  recentJiraIssues,
  workspaces = [],
}: DashboardSidePanelsProps) {
  const claudeOk = Boolean(status?.claudeInstalled);
  const githubOk = Boolean(status?.githubTokenConfigured);
  const showReadiness = !claudeOk || !githubOk || archivedCount > 0;

  return (
    <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
      {showReadiness ? (
        <HudPanel>
          <SectionLabel>Systems</SectionLabel>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Needs attention
          </Typography>
          <Stack spacing={1.25}>
            {!claudeOk ? (
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">Claude Code</Typography>
                <Chip size="small" label="Missing" color="warning" variant="outlined" />
              </Stack>
            ) : null}
            {!githubOk ? (
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">GitHub</Typography>
                <Chip size="small" label="No token" color="default" variant="outlined" />
              </Stack>
            ) : null}
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
          </Stack>
        </HudPanel>
      ) : null}

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
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <PullRequestStatusIcon
                    status={resolvePullRequestStatus(pr)}
                    sx={{ fontSize: 16, flexShrink: 0 }}
                  />
                  <Typography className="pr-title" variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    #{pr.number} {pr.title}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {pr.owner}/{pr.repo} · {pr.category === 'authored' ? 'authored' : 'review'}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </HudPanel>

      <DashboardGithubIssuesPanel
        githubConfigured={githubConfigured}
        issuesLoading={issuesLoading}
        recentIssues={recentIssues}
      />

      <DashboardJiraIssuesPanel
        jiraConfigured={jiraConfigured}
        jiraIssuesLoading={jiraIssuesLoading}
        recentJiraIssues={recentJiraIssues}
        workspaces={workspaces.length > 0 ? workspaces : recentWorkspaces}
      />
    </Stack>
  );
}
