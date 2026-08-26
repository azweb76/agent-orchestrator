import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { api } from '../api/client';
import { CreateWorkspaceDialog } from '../components/CreateWorkspaceDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ListPanel, ListRow, ListRowMeta, ListRowTitle } from '../components/ui/ListPanel';
import { PageHeader } from '../components/ui/PageHeader';

export function WorkspacesPage() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const { data: workspaces, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !workspaces) return workspaces ?? [];
    return workspaces.filter((ws) => {
      const haystack = `${ws.name} ${ws.githubOwner}/${ws.githubRepo}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [workspaces, filter]);

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

      <CreateWorkspaceDialog open={open} onClose={() => setOpen(false)} />
    </Stack>
  );
}
