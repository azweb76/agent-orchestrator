import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { api } from '../api/client';

export function WorkspacesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [name, setName] = useState('');

  const { data: workspaces, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createWorkspace({ repoUrl, name: name || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setOpen(false);
      setRepoUrl('');
      setName('');
    },
  });

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Box>
          <Typography variant="h4" gutterBottom>
            Workspaces
          </Typography>
          <Typography color="text.secondary">
            Manage git repositories, worktrees, and Claude Code agents locally.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Add workspace
        </Button>
      </Stack>

      {error && <Alert severity="error">{(error as Error).message}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : workspaces?.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <FolderOpenOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No workspaces yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Clone a GitHub repository to create your first workspace.
          </Typography>
          <Button variant="contained" onClick={() => setOpen(true)}>
            Add workspace
          </Button>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {workspaces?.map((workspace) => (
            <Grid key={workspace.id} size={{ xs: 12, md: 6, lg: 4 }}>
              <Card>
                <CardActionArea component={RouterLink} to={`/workspaces/${workspace.id}`}>
                  <CardContent>
                    <Typography variant="h6">{workspace.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {workspace.githubOwner}/{workspace.githubRepo}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Typography variant="caption" color="text.secondary">
                        {workspace.worktreeCount} worktrees
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        •
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {workspace.agentCount} agents
                      </Typography>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add workspace</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="GitHub repository URL"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Display name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />
            {createMutation.error && (
              <Alert severity="error">{(createMutation.error as Error).message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!repoUrl || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Cloning…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
