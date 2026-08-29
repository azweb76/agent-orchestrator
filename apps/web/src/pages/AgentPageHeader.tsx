import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import AutoModeOutlinedIcon from '@mui/icons-material/AutoModeOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import type { AgentDetail } from '@agent-orchestrator/shared';
import { resolveAutopilotEnabled } from '@agent-orchestrator/shared';
import { useAutomationSettings } from '../automation/useAutomationSettings';
import { AgentDeliveryPhaseChip } from '../components/agent/AgentDeliveryPhaseChip';
import { PullRequestStatusIcon } from '../components/pr/PullRequestStatusIcon';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageBreadcrumbs } from '../components/ui/PageBreadcrumbs';
import { PrStatusChip } from '../components/pr/PrStatusChip';
import { statusColor } from '../theme';
import { statusLabel } from '../utils/format';
import { pullRequestPath } from '../utils/paths';
import { useAgentLinkedPr } from '../components/agent/useAgentLinkedPr';
import { resolvePullRequestStatus } from '../components/pr/pullRequestStatus';

interface AgentPageHeaderProps {
  agent: AgentDetail;
  archived: boolean;
  archivePending: boolean;
  unarchivePending: boolean;
  autopilotPending?: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onCreatePr: () => void;
  onAutopilotChange?: (enabled: boolean | null) => void;
}

export function AgentPageHeader({
  agent,
  archived,
  archivePending,
  unarchivePending,
  autopilotPending,
  onArchive,
  onUnarchive,
  onCreatePr,
  onAutopilotChange,
}: AgentPageHeaderProps) {
  const { settings: automationSettings } = useAutomationSettings();
  const effectiveAutopilot = resolveAutopilotEnabled(automationSettings, agent.autopilot);
  const prNumber = agent.worktree.prNumber;
  const { pr } = useAgentLinkedPr(agent);
  const prStatus = pr ? resolvePullRequestStatus(pr) : prNumber != null ? 'open' : null;
  const prUrl =
    prNumber != null
      ? `https://github.com/${agent.workspace.githubOwner}/${agent.workspace.githubRepo}/pull/${prNumber}`
      : null;

  return (
    <>
      <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
        <PageBreadcrumbs
          items={[
            { label: 'Workspaces', to: '/workspaces' },
            { label: agent.workspace.name, to: `/workspaces/${agent.workspace.id}` },
            { label: agent.name },
          ]}
        />
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, flexShrink: 0 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: { xs: '1.2rem', md: '1.4rem' } }}>
              {agent.name}
            </Typography>
            <Chip
              size="small"
              label={statusLabel(agent.status)}
              color={statusColor(agent.status)}
              variant="outlined"
            />
            <AgentDeliveryPhaseChip agent={agent} archived={archived} />
            {prNumber != null && (
              <Chip
                size="small"
                icon={
                  prStatus ? (
                    <PullRequestStatusIcon status={prStatus} sx={{ ml: 0.5 }} />
                  ) : undefined
                }
                label={
                  agent.worktree.prTitle
                    ? `PR #${prNumber}: ${agent.worktree.prTitle}`
                    : `PR #${prNumber}`
                }
                color={
                  prStatus === 'open'
                    ? 'success'
                    : prStatus === 'merged'
                      ? 'secondary'
                      : prStatus === 'closed'
                        ? 'error'
                        : 'default'
                }
                variant="outlined"
                component="a"
                href={prUrl!}
                target="_blank"
                rel="noopener noreferrer"
                clickable
                sx={{ maxWidth: { xs: '100%', sm: 360 } }}
              />
            )}
            {agent.prStatus && (
              <PrStatusChip
                state={agent.prStatus.state}
                draft={agent.prStatus.draft}
                merged={agent.prStatus.merged}
                checksRollup={agent.prStatus.checksRollup}
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            <Box
              component={RouterLink}
              to={`/workspaces/${agent.workspace.id}`}
              sx={{
                color: 'inherit',
                textDecoration: 'none',
                '&:hover': { color: 'secondary.main' },
              }}
            >
              {agent.workspace.githubOwner}/{agent.workspace.githubRepo}
            </Box>
            {' · '}
            {agent.worktree.name} · {agent.worktree.branch}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {!archived && onAutopilotChange ? (
            <ControlTooltip
              title={
                agent.autopilot == null
                  ? 'Using global autopilot setting (Option/Alt+click to reset override)'
                  : 'Per-agent autopilot override (Option/Alt+click to use global default)'
              }
            >
              <FormControlLabel
                sx={{ mr: 0.5, ml: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={effectiveAutopilot}
                    disabled={autopilotPending}
                    onChange={(event) => onAutopilotChange(event.target.checked)}
                    onClick={(event) => {
                      if (event.altKey || event.metaKey) {
                        event.preventDefault();
                        onAutopilotChange(null);
                      }
                    }}
                  />
                }
                label={
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <AutoModeOutlinedIcon sx={{ fontSize: 16 }} />
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      Autopilot{agent.autopilot == null ? '' : ' · override'}
                    </Typography>
                  </Stack>
                }
              />
            </ControlTooltip>
          ) : null}
          {archived ? (
            <ControlTooltip title="Restore this agent to the active fleet" disabled={unarchivePending}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<UnarchiveOutlinedIcon />}
                disabled={unarchivePending}
                onClick={onUnarchive}
              >
                Unarchive
              </Button>
            </ControlTooltip>
          ) : (
            <ControlTooltip title="Archive this agent and hide it from the active fleet" disabled={archivePending}>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<ArchiveOutlinedIcon />}
                disabled={archivePending}
                onClick={onArchive}
              >
                Archive
              </Button>
            </ControlTooltip>
          )}
          {prNumber != null ? (
            <ControlTooltip title={`Open pull request #${prNumber} in the app`}>
              <Button
                size="small"
                variant="contained"
                component={RouterLink}
                startIcon={
                  <PullRequestStatusIcon status={prStatus ?? 'open'} sx={{ color: 'inherit' }} />
                }
                to={pullRequestPath(
                  agent.workspace.githubOwner,
                  agent.workspace.githubRepo,
                  prNumber,
                )}
              >
                View PR #{prNumber}
              </Button>
            </ControlTooltip>
          ) : (
            <ControlTooltip
              title={archived ? 'Archived agents cannot create pull requests' : 'Create a pull request for this branch'}
              disabled={archived}
            >
              <Button
                size="small"
                variant="contained"
                startIcon={<PullRequestStatusIcon status="open" sx={{ color: 'inherit' }} />}
                disabled={archived}
                onClick={onCreatePr}
              >
                Create PR
              </Button>
            </ControlTooltip>
          )}
        </Stack>
      </Stack>
    </>
  );
}
