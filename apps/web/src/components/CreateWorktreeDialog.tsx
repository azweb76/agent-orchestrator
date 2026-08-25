import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
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
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

interface CreateWorktreeDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  defaultBranch?: string;
}

export function CreateWorktreeDialog({
  open,
  onClose,
  workspaceId,
  defaultBranch = '',
}: CreateWorktreeDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'branch' | 'pr'>('branch');
  const [branchMode, setBranchMode] = useState<'existing' | 'new' | 'idea'>('existing');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [ideaText, setIdeaText] = useState('');
  const [selectedPr, setSelectedPr] = useState<number | ''>('');

  const workspaceQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.getWorkspace(workspaceId),
    enabled: open && Boolean(workspaceId) && !defaultBranch,
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', workspaceId],
    queryFn: () => api.listBranches(workspaceId),
    enabled: open && tab === 'branch',
  });

  const pullsQuery = useQuery({
    queryKey: ['pulls', workspaceId],
    queryFn: () => api.listPullRequests(workspaceId),
    enabled: open && tab === 'pr',
  });

  const resolvedDefaultBranch =
    baseBranch || defaultBranch || workspaceQuery.data?.defaultBranch || '';

  const invalidateAfterCreate = () => {
    queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['sidebar'] });
  };

  const resetForm = () => {
    setTab('branch');
    setBranchMode('existing');
    setSelectedBranch('');
    setNewBranchName('');
    setBaseBranch('');
    setIdeaText('');
    setSelectedPr('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const createFromBranch = useMutation({
    mutationFn: () => {
      if (branchMode === 'new' || branchMode === 'idea') {
        return api.createWorktreeFromBranch(workspaceId, {
          branch: newBranchName,
          createNew: true,
          baseBranch: resolvedDefaultBranch || undefined,
        });
      }
      return api.createWorktreeFromBranch(workspaceId, { branch: selectedBranch });
    },
    onSuccess: (data) => {
      invalidateAfterCreate();
      handleClose();
      navigate(`/agents/${data.agent.id}`);
    },
  });

  const createFromPr = useMutation({
    mutationFn: () => api.createWorktreeFromPr(workspaceId, { prNumber: Number(selectedPr) }),
    onSuccess: (data) => {
      invalidateAfterCreate();
      handleClose();
      navigate(`/agents/${data.agent.id}`);
    },
  });

  const suggestBranchName = useMutation({
    mutationFn: () => api.suggestBranchName(workspaceId, ideaText),
    onSuccess: (data) => {
      setNewBranchName(data.branchName);
    },
  });

  const createPending = createFromBranch.isPending || createFromPr.isPending;
  const createError = createFromBranch.error ?? createFromPr.error ?? suggestBranchName.error;
  const canCreateBranch =
    branchMode === 'existing' ? Boolean(selectedBranch) : Boolean(newBranchName.trim());

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create agent</DialogTitle>
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
                onChange={(e) => setBranchMode(e.target.value as 'existing' | 'new' | 'idea')}
              >
                <FormControlLabel value="existing" control={<Radio />} label="Existing branch" />
                <FormControlLabel value="new" control={<Radio />} label="New branch" />
                <FormControlLabel value="idea" control={<Radio />} label="From idea" />
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
                {branchMode === 'idea' && (
                  <>
                    <TextField
                      label="Describe your idea"
                      value={ideaText}
                      onChange={(e) => setIdeaText(e.target.value)}
                      placeholder="Add a dark mode toggle to the settings page"
                      fullWidth
                      multiline
                      minRows={3}
                    />
                    <Button
                      variant="outlined"
                      onClick={() => suggestBranchName.mutate()}
                      disabled={!ideaText.trim() || suggestBranchName.isPending}
                    >
                      {suggestBranchName.isPending ? 'Suggesting…' : 'Suggest'}
                    </Button>
                  </>
                )}
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
                    value={resolvedDefaultBranch}
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
        <Button onClick={handleClose}>Cancel</Button>
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
  );
}
