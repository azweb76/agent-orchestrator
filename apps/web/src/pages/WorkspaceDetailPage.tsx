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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { statusColor } from '../theme';

export function WorkspaceDetailPage() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<'branch' | 'pr'>('branch');
  const [branchMode, setBranchMode] = useState<'existing' | 'new'>('existing');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [selectedPr, setSelectedPr] = useState<number | ''>('');

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

  const branchesQuery = useQuery({
    queryKey: ['branches', workspaceId],
    queryFn: () => api.listBranches(workspaceId),
    enabled: dialogOpen && tab === 'branch',
  });

  const pullsQuery = useQuery({
    queryKey: ['pulls', workspaceId],
    queryFn: () => api.listPullRequests(workspaceId),
    enabled: dialogOpen && tab === 'pr',
  });

  const workspace = workspaceQuery.data;
  const defaultBaseBranch = baseBranch || workspace?.defaultBranch || '';

  const createFromBranch = useMutation({
    mutationFn: () => {
      if (branchMode === 'new') {
        return api.createWorktreeFromBranch(workspaceId, {
          branch: newBranchName,
          createNew: true,
          baseBranch: defaultBaseBranch || undefined,
        });
      }
      return api.createWorktreeFromBranch(workspaceId, { branch: selectedBranch });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      handleCloseDialog();
      navigate(`/agents/${data.agent.id}`);
    },
  });

  const createFromPr = useMutation({
    mutationFn: () => api.createWorktreeFromPr(workspaceId, { prNumber: Number(selectedPr) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      handleCloseDialog();
      navigate(`/agents/${data.agent.id}`);
    },
  });

  const deleteWorktree = useMutation({
    mutationFn: (worktreeId: string) => api.deleteWorktree(worktreeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  const deleteWorkspace = useMutation({
    mutationFn: () => api.deleteWorkspace(workspaceId),
    onSuccess: () => navigate('/'),
  });

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setBranchMode('existing');
    setSelectedBranch('');
    setNewBranchName('');
    setBaseBranch('');
    setSelectedPr('');
  };

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

  const createPending = createFromBranch.isPending || createFromPr.isPending;
  const createError = createFromBranch.error ?? createFromPr.error;
  const canCreateBranch =
    branchMode === 'existing' ? Boolean(selectedBranch) : Boolean(newBranchName.trim());

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
            New worktree
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
            No worktrees yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Create a worktree from a branch or pull request to spawn a Claude agent.
          </Typography>
          <Button variant="contained" onClick={() => setDialogOpen(true)}>
            Create worktree
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

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Create worktree</DialogTitle>
        <DialogContent>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
            <Tab value="branch" label="From branch" />
            <Tab value="pr" label="From PR" />
          </Tabs>

          {tab === 'branch' ? (
            <Stack spacing={2}>
              <FormControl>
                <RadioGroup
                  row
                  value={branchMode}
                  onChange={(e) => setBranchMode(e.target.value as 'existing' | 'new')}
                >
                  <FormControlLabel value="existing" control={<Radio />} label="Existing branch" />
                  <FormControlLabel value="new" control={<Radio />} label="New branch" />
                </RadioGroup>
              </FormControl>

              {branchMode === 'existing' ? (
                <FormControl fullWidth>
                  <InputLabel>Branch</InputLabel>
                  <Select
                    label="Branch"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    {branchesQuery.data?.map((branch) => (
                      <MenuItem key={branch.name} value={branch.name}>
                        {branch.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <>
                  <TextField
                    label="New branch name"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="feature/my-change"
                    fullWidth
                    required
                  />
                  <FormControl fullWidth>
                    <InputLabel>Base branch</InputLabel>
                    <Select
                      label="Base branch"
                      value={defaultBaseBranch}
                      onChange={(e) => setBaseBranch(e.target.value)}
                    >
                      {branchesQuery.data?.map((branch) => (
                        <MenuItem key={branch.name} value={branch.name}>
                          {branch.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </>
              )}
            </Stack>
          ) : (
            <FormControl fullWidth>
              <InputLabel>Pull request</InputLabel>
              <Select
                label="Pull request"
                value={selectedPr}
                onChange={(e) => setSelectedPr(e.target.value as number | '')}
              >
                {pullsQuery.data?.map((pr) => (
                  <MenuItem key={pr.number} value={pr.number}>
                    #{pr.number} {pr.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {createError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(createError as Error).message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            disabled={createPending || (tab === 'branch' ? !canCreateBranch : selectedPr === '')}
            onClick={() => {
              if (tab === 'branch') createFromBranch.mutate();
              else createFromPr.mutate();
            }}
          >
            {createPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
