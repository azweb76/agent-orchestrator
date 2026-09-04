import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import type { AgentDetail } from '@agent-orchestrator/shared';
import { AgentDeliveryPhaseChip } from '../components/agent/AgentDeliveryPhaseChip';
import { PullRequestStatusIcon } from '../components/pr/PullRequestStatusIcon';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageBreadcrumbs } from '../components/ui/PageBreadcrumbs';
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
  onArchive: () => void;
  onUnarchive: () => void;
  onCreatePr: () => void;
}

/** Runtime status is redundant with delivery phase when idle — only surface active states. */
function showRuntimeStatus(status: AgentDetail['status']): boolean {
  return status === 'running' || status === 'queued' || status === 'stopped';
}

export function AgentPageHeader({
  agent,
  archived,
  archivePending,
  unarchivePending,
  onArchive,
  onUnarchive,
  onCreatePr,
}: AgentPageHeaderProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const prNumber = agent.worktree.prNumber;
  const { pr } = useAgentLinkedPr(agent);
  const prStatus = pr ? resolvePullRequestStatus(pr) : prNumber != null ? 'open' : null;
  const busy = archivePending || unarchivePending;

  return (
    <Stack spacing={0.75} sx={{ flexShrink: 0 }}>
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
        direction="row"
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: { xs: '1.15rem', md: '1.35rem' } }}
            >
              {agent.name}
            </Typography>
            {showRuntimeStatus(agent.status) ? (
              <Chip
                size="small"
                label={statusLabel(agent.status)}
                color={statusColor(agent.status)}
                variant="outlined"
              />
            ) : null}
            {/* PR bar owns delivery status once a PR is linked */}
            {prNumber == null || archived ? (
              <AgentDeliveryPhaseChip agent={agent} archived={archived} />
            ) : null}
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: 'block', mt: 0.35, fontFamily: 'IBM Plex Mono, monospace' }}
          >
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
              {agent.workspace.githubOwner}/{agent.workspace.githubRepo}
              {' · '}
            </Box>
            {agent.worktree.branch}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {prNumber != null ? (
            <ControlTooltip title={`Open pull request #${prNumber}`}>
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
                PR #{prNumber}
              </Button>
            </ControlTooltip>
          ) : (
            <ControlTooltip
              title={archived ? 'Archived agents cannot create pull requests' : 'Create a pull request'}
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

          <ControlTooltip title="Agent actions" disabled={busy}>
            <IconButton
              size="small"
              aria-label="Agent actions"
              disabled={busy}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
        </Stack>
      </Stack>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {archived ? (
          <MenuItem
            disabled={unarchivePending}
            onClick={() => {
              setMenuAnchor(null);
              onUnarchive();
            }}
          >
            <ListItemIcon>
              <UnarchiveOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Unarchive
          </MenuItem>
        ) : (
          <MenuItem
            disabled={archivePending}
            onClick={() => {
              setMenuAnchor(null);
              onArchive();
            }}
          >
            <ListItemIcon>
              <ArchiveOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Archive
          </MenuItem>
        )}
      </Menu>
    </Stack>
  );
}
