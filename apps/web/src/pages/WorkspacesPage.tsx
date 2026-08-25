import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import type { GitHubRepository } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { EmptyState } from '../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../components/ui/ListPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { ResponsiveDialog } from '../components/ui/ResponsiveDialog';

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
  const [filter, setFilter] = useState('');
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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !workspaces) return workspaces ?? [];
    return workspaces.filter((ws) => {
      const haystack = `${ws.name} ${ws.githubOwner}/${ws.githubRepo}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [workspaces, filter]);

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
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Repositories"
        title="Workspaces"
        description="Clone GitHub repos locally, then spin up worktrees and Claude agents from each one."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
            Add workspace
          </Button>
        }
      />

      {error && <Alert severity="error">{(error as Error).message}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : workspaces?.length === 0 ? (
        <EmptyState
          icon={<FolderOpenOutlinedIcon />}
          title="No workspaces yet"
          description="Clone a GitHub repository to create your first workspace."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
              Add workspace
            </Button>
          }
        />
      ) : (
        <Stack spacing={1.5}>
          {(workspaces?.length ?? 0) > 4 ? (
            <TextField
              size="small"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter workspaces…"
              sx={{ maxWidth: 360, width: '100%' }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  'aria-label': 'Filter workspaces',
                },
              }}
            />
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState
              compact
              title="No matches"
              description="Try a different name or repository filter."
            />
          ) : (
            <ListPanel>
              {filtered.map((workspace) => (
                <ListRow
                  key={workspace.id}
                  component={RouterLink}
                  to={`/workspaces/${workspace.id}`}
                >
                  <ListRowTitle>{workspace.name}</ListRowTitle>
                  <ListRowMeta>
                    {workspace.githubOwner}/{workspace.githubRepo}
                    {' · '}
                    {workspace.worktreeCount} worktree{workspace.worktreeCount === 1 ? '' : 's'}
                    {' · '}
                    {workspace.agentCount} agent{workspace.agentCount === 1 ? '' : 's'}
                  </ListRowMeta>
                </ListRow>
              ))}
            </ListPanel>
          )}
        </Stack>
      )}

      <ResponsiveDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
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
                    autoFocus
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
                autoFocus
              />
            )}

            <TextField
              label="Display name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              helperText="Defaults to the repository name"
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
      </ResponsiveDialog>
    </Stack>
  );
}
