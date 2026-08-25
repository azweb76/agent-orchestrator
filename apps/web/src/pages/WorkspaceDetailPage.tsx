import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import { CreateWorktreeDialog } from '../components/CreateWorktreeDialog';
import { statusColor } from '../theme';

export function WorkspaceDetailPage() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  const deleteWorkspace = useMutation({
    mutationFn: () => api.deleteWorkspace(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate('/');
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
    return <Alert severity="error">{(workspaceQuery.error as Error)?.message ?? 'Workspace not found'}</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h4">{workspace.name}</Typography>
          <Typography color="text.secondary">
            {workspace.githubOwner}/{workspace.githubRepo} • default branch: {workspace.defaultBranch}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            New agent
          </Button>
          <Button
            color="error"
            variant="outlined"
            startIcon={<DeleteOutlineOutlinedIcon />}
            onClick={() => {
              if (confirm('Delete this workspace and all worktrees?')) {
                deleteWorkspace.mutate();
              }
            }}
          >
            Delete
          </Button>
        </Stack>
      </Stack>

      {worktreesQuery.error && <Alert severity="error">{(worktreesQuery.error as Error).message}</Alert>}

      {worktreesQuery.isLoading ? (
        <CircularProgress />
      ) : worktreesQuery.data?.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            No agents yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Create a worktree from a branch or pull request to spawn a Claude agent.
          </Typography>
          <Button variant="contained" onClick={() => setDialogOpen(true)}>
            Create agent
          </Button>
        </Card>
      ) : (
        <Stack spacing={2}>
          {worktreesQuery.data?.map((worktree) => (
            <Card key={worktree.id}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ justifyContent: 'space-between' }}
                >
                  <Box>
                    <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
                      <Typography variant="h6">{worktree.name}</Typography>
                      {worktree.prNumber && (
                        <Chip size="small" label={`PR #${worktree.prNumber}`} color="info" variant="outlined" />
                      )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Branch: {worktree.branch}
                      {worktree.prTitle ? ` • ${worktree.prTitle}` : ''}
                    </Typography>
                    {worktree.agent && (
                      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                        <SmartToyOutlinedIcon fontSize="small" color="secondary" />
                        <Typography variant="body2">{worktree.agent.name}</Typography>
                        <Chip
                          size="small"
                          label={worktree.agent.status}
                          color={statusColor(worktree.agent.status)}
                        />
                      </Stack>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1}>
                    {worktree.agent && (
                      <Button variant="contained" onClick={() => navigate(`/agents/${worktree.agent!.id}`)}>
                        Open agent
                      </Button>
                    )}
                    <Button
                      color="error"
                      variant="outlined"
                      onClick={() => {
                        if (confirm('Remove this worktree and its agent?')) {
                          deleteWorktree.mutate(worktree.id);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <CreateWorktreeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workspaceId={workspaceId}
        defaultBranch={workspace.defaultBranch}
      />
    </Stack>
  );
}
