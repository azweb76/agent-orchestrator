import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CallSplitOutlinedIcon from '@mui/icons-material/CallSplitOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { CreatePullRequestDialog } from '../CreatePullRequestDialog';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { brainSyncHeadline } from './brainSync';

function invalidateBrain(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['brain-sync'] }),
    queryClient.invalidateQueries({ queryKey: ['personal-skills'] }),
    queryClient.invalidateQueries({ queryKey: ['agent-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['task-followups'] }),
    queryClient.invalidateQueries({ queryKey: ['personal-agents'] }),
  ]);
}

export function BrainSyncBar() {
  const queryClient = useQueryClient();
  const [repoUrl, setRepoUrl] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState('sync(brain): update library');
  const [prBody, setPrBody] = useState('');
  const [prDraft, setPrDraft] = useState(true);

  const { data: status, error } = useQuery({
    queryKey: ['brain-sync'],
    queryFn: api.getBrainSync,
  });

  const connectMutation = useMutation({
    mutationFn: () => api.connectBrainRepo({ repoUrl: repoUrl.trim() }),
    onSuccess: async () => {
      await invalidateBrain(queryClient);
      setConnectOpen(false);
      setRepoUrl('');
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: api.disconnectBrainRepo,
    onSuccess: () => invalidateBrain(queryClient),
  });

  const pullMutation = useMutation({
    mutationFn: api.pullBrainRepo,
    onSuccess: () => invalidateBrain(queryClient),
  });

  const createPrMutation = useMutation({
    mutationFn: (body: { title: string; body: string; draft: boolean }) =>
      api.createBrainPullRequest(body),
    onSuccess: async (pr) => {
      await invalidateBrain(queryClient);
      if (pr.htmlUrl) window.open(pr.htmlUrl, '_blank', 'noopener,noreferrer');
    },
  });

  const configured = Boolean(status?.configured);
  const dirty = Boolean(status?.dirty);
  const behind = (status?.behindBy ?? 0) > 0;

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: { xs: 2, sm: 2.5 },
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Library repo
          </Typography>
          <Typography color="text.secondary" sx={{ lineHeight: 1.5 }}>
            Sync skills, tasks, and follow-ups with one GitHub repository. Modified files can open
            a PR; incoming commits can be pulled into this library.
          </Typography>
          {status ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
              <Chip size="small" variant="outlined" label={brainSyncHeadline(status)} />
              {status.lastPrUrl ? (
                <Chip
                  size="small"
                  variant="outlined"
                  component="a"
                  clickable
                  href={status.lastPrUrl}
                  target="_blank"
                  rel="noreferrer"
                  label={status.lastPrNumber ? `PR #${status.lastPrNumber}` : 'Open PR'}
                />
              ) : null}
            </Stack>
          ) : null}
          {dirty && status?.changedFiles.length ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {status.changedFiles.slice(0, 8).join(' · ')}
              {status.changedFiles.length > 8 ? ` · +${status.changedFiles.length - 8} more` : ''}
            </Typography>
          ) : null}
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {configured ? (
            <>
              <ControlTooltip
                title={behind ? 'Fast-forward this library from origin' : 'Origin has no new commits'}
                disabled={!behind || pullMutation.isPending}
              >
                <Button
                  variant="outlined"
                  startIcon={<SyncOutlinedIcon />}
                  disabled={!behind || pullMutation.isPending}
                  onClick={() => pullMutation.mutate()}
                >
                  {pullMutation.isPending ? 'Pulling…' : 'Pull in changes'}
                </Button>
              </ControlTooltip>
              <ControlTooltip
                title={dirty ? 'Commit modified library files and open a GitHub pull request' : 'No modified files'}
                disabled={!dirty || createPrMutation.isPending}
              >
                <Button
                  variant="contained"
                  startIcon={<CallSplitOutlinedIcon />}
                  disabled={!dirty || createPrMutation.isPending}
                  onClick={() => setPrOpen(true)}
                >
                  Create PR
                </Button>
              </ControlTooltip>
              <ControlTooltip title="Stop syncing this repository (keeps local library)">
                <Button
                  color="inherit"
                  disabled={disconnectMutation.isPending}
                  onClick={() => disconnectMutation.mutate()}
                >
                  Disconnect
                </Button>
              </ControlTooltip>
            </>
          ) : connectOpen ? (
            <Stack spacing={1} sx={{ minWidth: { sm: 280 } }}>
              <ControlTooltip title="GitHub repository that stores the Brain library">
                <TextField
                  label="GitHub repo"
                  placeholder="you/brain-library"
                  value={repoUrl}
                  onChange={(event) => setRepoUrl(event.target.value)}
                  fullWidth
                  size="small"
                />
              </ControlTooltip>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  disabled={!repoUrl.trim() || connectMutation.isPending}
                  onClick={() => connectMutation.mutate()}
                >
                  {connectMutation.isPending ? 'Connecting…' : 'Connect'}
                </Button>
                <Button onClick={() => setConnectOpen(false)}>Cancel</Button>
              </Stack>
            </Stack>
          ) : (
            <ControlTooltip title="Clone a GitHub repo to store this library">
              <Button
                variant="contained"
                startIcon={<LinkOutlinedIcon />}
                onClick={() => setConnectOpen(true)}
              >
                Connect repo
              </Button>
            </ControlTooltip>
          )}
        </Stack>
      </Stack>

      {error ? <Alert severity="error" sx={{ mt: 2 }}>{(error as Error).message}</Alert> : null}
      {connectMutation.error ? (
        <Alert severity="error" sx={{ mt: 2 }}>{(connectMutation.error as Error).message}</Alert>
      ) : null}
      {pullMutation.error ? (
        <Alert severity="error" sx={{ mt: 2 }}>{(pullMutation.error as Error).message}</Alert>
      ) : null}
      {disconnectMutation.error ? (
        <Alert severity="error" sx={{ mt: 2 }}>{(disconnectMutation.error as Error).message}</Alert>
      ) : null}

      <CreatePullRequestDialog
        open={prOpen}
        title={prTitle}
        body={prBody}
        draft={prDraft}
        mutation={createPrMutation}
        onClose={() => setPrOpen(false)}
        onCreated={() => setPrOpen(false)}
        onTitleChange={setPrTitle}
        onBodyChange={setPrBody}
        onDraftChange={setPrDraft}
      />
    </Box>
  );
}
