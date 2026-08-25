import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
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
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import type { GitHubRepository } from '@agent-orchestrator/shared';
import { api } from '../api/client';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function WorkspacesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const debouncedSearch = useDebouncedValue(repoSearch, 300);

  const { data: workspaces, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
  });

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  const reposQuery = useQuery({
    queryKey: ['github-repos', debouncedSearch],
    queryFn: () => api.searchRepositories(debouncedSearch),
    enabled: open && Boolean(status?.githubTokenConfigured),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedRepo) throw new Error('Select a repository');
      return api.createWorkspace({ repoUrl: selectedRepo.htmlUrl, name: name || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      setOpen(false);
      setSelectedRepo(null);
      setRepoSearch('');
      setName('');
    },
  });

  const handleClose = () => {
    setOpen(false);
    setSelectedRepo(null);
    setRepoSearch('');
    setName('');
  };

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

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Add workspace</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!status?.githubTokenConfigured ? (
              <Alert severity="warning">
                Set <code>GITHUB_TOKEN</code> to search your accessible repositories. You can still paste a
                repository URL below.
              </Alert>
            ) : null}

            {status?.githubTokenConfigured ? (
              <Autocomplete
                options={reposQuery.data ?? []}
                loading={reposQuery.isLoading}
                value={selectedRepo}
                onChange={(_, value) => setSelectedRepo(value)}
                inputValue={repoSearch}
                onInputChange={(_, value) => setRepoSearch(value)}
                getOptionLabel={(option) => option.fullName}
                isOptionEqualToValue={(option, value) => option.fullName === value.fullName}
                filterOptions={(options) => options}
                noOptionsText={reposQuery.isLoading ? 'Searching…' : 'No repositories found'}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="GitHub repository"
                    placeholder="Search your repositories…"
                    slotProps={{
                      ...params.slotProps,
                      input: {
                        ...params.slotProps.input,
                        endAdornment: (
                          <>
                            {reposQuery.isLoading ? <CircularProgress size={18} /> : null}
                            {params.slotProps.input.endAdornment}
                          </>
                        ),
                      },
                    }}
                  />
                )}
                renderOption={(props, option) => {
                  const { key, ...rest } = props;
                  return (
                    <Box component="li" key={key} {...rest}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: '100%' }}>
                        {option.private && <LockOutlinedIcon fontSize="small" color="action" />}
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2">{option.fullName}</Typography>
                          {option.description && (
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {option.description}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </Box>
                  );
                }}
              />
            ) : (
              <TextField
                label="GitHub repository URL"
                placeholder="https://github.com/owner/repo"
                value={repoSearch}
                onChange={(e) => {
                  setRepoSearch(e.target.value);
                  setSelectedRepo(
                    e.target.value
                      ? {
                          owner: '',
                          name: '',
                          fullName: e.target.value,
                          htmlUrl: e.target.value,
                          description: null,
                          private: false,
                        }
                      : null,
                  );
                }}
                fullWidth
                required
              />
            )}

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
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!selectedRepo?.htmlUrl || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Cloning…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
