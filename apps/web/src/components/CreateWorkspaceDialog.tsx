import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { GitHubRepository } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { ResponsiveDialog } from './ui/ResponsiveDialog';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  /** Navigate to the new workspace after create (default true). */
  navigateOnSuccess?: boolean;
}

export function CreateWorkspaceDialog({
  open,
  onClose,
  navigateOnSuccess = true,
}: CreateWorkspaceDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const debouncedSearch = useDebouncedValue(repoSearch, 300);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    enabled: open,
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
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      reset();
      onClose();
      if (navigateOnSuccess) {
        navigate(`/workspaces/${workspace.id}`);
      }
    },
  });

  const reset = () => {
    setSelectedRepo(null);
    setRepoSearch('');
    setName('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
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
  );
}
