import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreateWorktreeDialog } from '../components/CreateWorktreeDialog';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../components/ui/ListPanel';
import { PageBreadcrumbs } from '../components/ui/PageBreadcrumbs';
import { PageHeader } from '../components/ui/PageHeader';
import { statusColor } from '../theme';
import { statusLabel } from '../utils/format';
import { pullRequestPath } from '../utils/paths';

export function WorkspaceDetailPage() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);
  const [removeWorktreeId, setRemoveWorktreeId] = useState<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.getWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const worktreesQuery = useQuery({
    queryKey: ['worktrees', workspaceId],
    queryFn: () => api.listWorktrees(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const workspace = workspaceQuery.data;

  const deleteWorktree = useMutation({
    mutationFn: (worktreeId: string) => api.deleteWorktree(worktreeId),
    onSuccess: () => {
      setRemoveWorktreeId(null);
      queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  const deleteWorkspace = useMutation({
    mutationFn: () => api.deleteWorkspace(workspaceId),
    onSuccess: () => {
      setDeleteWorkspaceOpen(false);
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate('/workspaces');
    },
  });

  if (workspaceQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (workspaceQuery.error || !workspace) {
    return (
      <Alert severity="error">
        {(workspaceQuery.error as Error)?.message ?? 'Workspace not found'}
      </Alert>
    );
  }

  return (
    <Stack spacing={2.5}>
      <PageHeader
        breadcrumbs={
          <PageBreadcrumbs
            items={[
              { label: 'Workspaces', to: '/workspaces' },
              { label: workspace.name },
            ]}
          />
        }
        eyebrow="Workspace"
        title={workspace.name}
        description={`${workspace.githubOwner}/${workspace.githubRepo} · default branch ${workspace.defaultBranch}`}
        actions={
          <>
            <ControlTooltip title="Create a worktree and Claude agent from a branch or pull request">
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
                New agent
              </Button>
            </ControlTooltip>
            <ControlTooltip title="Delete this workspace and all of its worktrees and agents">
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlineOutlinedIcon />}
                onClick={() => setDeleteWorkspaceOpen(true)}
              >
                Delete
              </Button>
            </ControlTooltip>
          </>
        }
      />

      {worktreesQuery.error && (
        <Alert severity="error">{(worktreesQuery.error as Error).message}</Alert>
      )}

      <Box>
        <Typography
          variant="caption"
          sx={{
            fontFamily: '"IBM Plex Mono", monospace',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            display: 'block',
            mb: 1,
          }}
        >
          Agents
        </Typography>

        {worktreesQuery.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : worktreesQuery.data?.length === 0 ? (
          <EmptyState
            icon={<SmartToyOutlinedIcon />}
            title="No agents yet"
            description="Create a worktree from a branch or pull request to spawn a Claude agent."
            action={
              <ControlTooltip title="Create a worktree and Claude agent from a branch or pull request">
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
                  Create agent
                </Button>
              </ControlTooltip>
            }
          />
        ) : (
          <ListPanel>
            {worktreesQuery.data?.map((worktree) => (
              <ListRow
                key={worktree.id}
                secondaryAction={
                  <>
                    {worktree.agent ? (
                      <ControlTooltip title="Open this agent's chat">
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => navigate(`/agents/${worktree.agent!.id}`)}
                        >
                          Open agent
                        </Button>
                      </ControlTooltip>
                    ) : null}
                    <ControlTooltip title="Remove this worktree and its agent from the workspace">
                      <Button
                        color="error"
                        variant="outlined"
                        size="small"
                        onClick={() => setRemoveWorktreeId(worktree.id)}
                      >
                        Remove
                      </Button>
                    </ControlTooltip>
                  </>
                }
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.25 }}>
                  <ListRowTitle>{worktree.name}</ListRowTitle>
                  {worktree.prNumber ? (
                    <Chip
                      size="small"
                      label={`PR #${worktree.prNumber}`}
                      color="info"
                      variant="outlined"
                      clickable
                      component={RouterLink}
                      to={pullRequestPath(
                        workspace.githubOwner,
                        workspace.githubRepo,
                        worktree.prNumber,
                      )}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : null}
                </Stack>
                <ListRowMeta>
                  Branch: {worktree.branch}
                  {worktree.prTitle ? ` · ${worktree.prTitle}` : ''}
                </ListRowMeta>
                {worktree.agent ? (
                  <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                    <SmartToyOutlinedIcon fontSize="small" color="secondary" />
                    <Typography variant="body2">{worktree.agent.name}</Typography>
                    <Chip
                      size="small"
                      label={statusLabel(worktree.agent.status)}
                      color={statusColor(worktree.agent.status)}
                      variant="outlined"
                    />
                  </Stack>
                ) : null}
              </ListRow>
            ))}
          </ListPanel>
        )}
      </Box>

      <CreateWorktreeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workspaceId={workspaceId}
        defaultBranch={workspace.defaultBranch}
      />

      <ConfirmDialog
        open={deleteWorkspaceOpen}
        title="Delete workspace?"
        description="This deletes the workspace and all of its worktrees and agents. This cannot be undone."
        confirmLabel="Delete"
        loading={deleteWorkspace.isPending}
        onCancel={() => setDeleteWorkspaceOpen(false)}
        onConfirm={() => deleteWorkspace.mutate()}
      />

      <ConfirmDialog
        open={Boolean(removeWorktreeId)}
        title="Remove worktree?"
        description="This removes the worktree and its agent from the workspace."
        confirmLabel="Remove"
        loading={deleteWorktree.isPending}
        onCancel={() => setRemoveWorktreeId(null)}
        onConfirm={() => {
          if (removeWorktreeId) deleteWorktree.mutate(removeWorktreeId);
        }}
      />
    </Stack>
  );
}
