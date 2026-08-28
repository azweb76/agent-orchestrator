import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import type { AgentDetail } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageBreadcrumbs } from '../components/ui/PageBreadcrumbs';
import { statusColor } from '../theme';
import { statusLabel } from '../utils/format';
import { pullRequestPath } from '../utils/paths';

interface AgentPageHeaderProps {
  agent: AgentDetail;
  archived: boolean;
  archivePending: boolean;
  unarchivePending: boolean;
  deletePending: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onCreatePr: () => void;
}

export function AgentPageHeader({
  agent,
  archived,
  archivePending,
  unarchivePending,
  deletePending,
  onArchive,
  onUnarchive,
  onDelete,
  onCreatePr,
}: AgentPageHeaderProps) {
  const prNumber = agent.worktree.prNumber;
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
            {prNumber != null && (
              <Chip
                size="small"
                label={
                  agent.worktree.prTitle
                    ? `PR #${prNumber}: ${agent.worktree.prTitle}`
                    : `PR #${prNumber}`
                }
                color="info"
                variant="outlined"
                component="a"
                href={prUrl!}
                target="_blank"
                rel="noopener noreferrer"
                clickable
                sx={{ maxWidth: { xs: '100%', sm: 360 } }}
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
          {archived ? (
            <>
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
              <ControlTooltip
                title="Permanently delete this agent and its chat history"
                disabled={deletePending}
              >
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlinedIcon />}
                  disabled={deletePending}
                  onClick={onDelete}
                >
                  Delete
                </Button>
              </ControlTooltip>
            </>
          ) : (
            <>
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
              <ControlTooltip
                title="Permanently delete this agent and its chat history"
                disabled={deletePending}
              >
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlinedIcon />}
                  disabled={deletePending}
                  onClick={onDelete}
                >
                  Delete
                </Button>
              </ControlTooltip>
            </>
          )}
          {prNumber != null ? (
            <ControlTooltip title={`Open pull request #${prNumber} in the app`}>
              <Button
                size="small"
                variant="contained"
                component={RouterLink}
                startIcon={<MergeTypeIcon />}
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
                startIcon={<MergeTypeIcon />}
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
