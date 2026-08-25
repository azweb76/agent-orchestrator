import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PermissionMode } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { ChatPanel } from '../components/chat/ChatPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { statusColor } from '../theme';

export function AgentPage() {
  const { agentId = '' } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [prOpen, setPrOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [environment, setEnvironment] = useState('');

  const agentQuery = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.getAgent(agentId),
    enabled: Boolean(agentId),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2000 : false),
  });

  const eventsQuery = useQuery({
    queryKey: ['events', agentId],
    queryFn: () => api.getEvents(agentId),
    enabled: Boolean(agentId) && tab === 2,
  });

  const diffQuery = useQuery({
    queryKey: ['diff', agentId],
    queryFn: () => api.getDiff(agentId),
    enabled: Boolean(agentId) && tab === 1,
  });

  const updateMutation = useMutation({
    mutationFn: (body: {
      model?: string;
      environment?: string | null;
      permissionMode?: PermissionMode;
    }) => api.updateAgent(agentId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => api.startAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['messages', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.archiveAgent(agentId),
    onSuccess: () => {
      setArchiveOpen(false);
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  const createPrMutation = useMutation({
    mutationFn: () => api.createPr(agentId, { title: prTitle, body: prBody }),
    onSuccess: () => {
      setPrOpen(false);
      setPrTitle('');
      setPrBody('');
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  useEffect(() => {
    setEnvironment(agentQuery.data?.environment ?? '');
  }, [agentQuery.data?.environment]);

  if (agentQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (agentQuery.error || !agentQuery.data) {
    return <Alert severity="error">{(agentQuery.error as Error)?.message ?? 'Agent not found'}</Alert>;
  }

  const agent = agentQuery.data;
  const archived = Boolean(agent.archivedAt);
  const prNumber = agent.worktree.prNumber;
  const prUrl =
    prNumber != null
      ? `https://github.com/${agent.workspace.githubOwner}/${agent.workspace.githubRepo}/pull/${prNumber}`
      : null;

  return (
    <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, flexShrink: 0 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {agent.name}
            </Typography>
            <Chip size="small" label={agent.status} color={statusColor(agent.status)} />
            {prNumber != null && (
              <Chip
                size="small"
                label={agent.worktree.prTitle ? `PR #${prNumber}: ${agent.worktree.prTitle}` : `PR #${prNumber}`}
                color="info"
                variant="outlined"
                component="a"
                href={prUrl!}
                target="_blank"
                rel="noopener noreferrer"
                clickable
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            {agent.workspace.githubOwner}/{agent.workspace.githubRepo} • {agent.worktree.name} •{' '}
            {agent.worktree.branch}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            label="Environment"
            placeholder="ccpool_..."
            value={environment}
            disabled={archived}
            onChange={(e) => setEnvironment(e.target.value)}
            onBlur={() => {
              const next = environment || null;
              if (next !== (agent.environment ?? null)) {
                updateMutation.mutate({ environment: next });
              }
            }}
            sx={{ width: { xs: '100%', sm: 160 } }}
          />

          <Button
            size="small"
            variant="outlined"
            startIcon={<PlayArrowIcon />}
            disabled={archived || startMutation.isPending}
            onClick={() => startMutation.mutate()}
          >
            Start
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<StopIcon />}
            disabled={archived || stopMutation.isPending}
            onClick={() => stopMutation.mutate()}
          >
            Stop
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<ArchiveOutlinedIcon />}
            disabled={archived || archiveMutation.isPending}
            onClick={() => setArchiveOpen(true)}
          >
            Archive
          </Button>
          {prUrl ? (
            <Button
              size="small"
              variant="contained"
              startIcon={<OpenInNewIcon />}
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View PR #{prNumber}
            </Button>
          ) : (
            <Button
              size="small"
              variant="contained"
              startIcon={<MergeTypeIcon />}
              disabled={archived}
              onClick={() => setPrOpen(true)}
            >
              Create PR
            </Button>
          )}
        </Stack>
      </Stack>

      <Paper
        sx={{
          p: 0,
          overflow: 'hidden',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          sx={{ px: 1.5, minHeight: 40, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
        >
          <Tab label="Chat" sx={{ minHeight: 40, py: 1 }} />
          <Tab label="Diff" sx={{ minHeight: 40, py: 1 }} />
          <Tab label="Events" sx={{ minHeight: 40, py: 1 }} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ChatPanel agent={agent} archived={archived} />
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 1.5, flex: 1, minHeight: 0, overflow: 'auto' }}>
            {diffQuery.isLoading ? (
              <CircularProgress />
            ) : diffQuery.error ? (
              <Alert severity="error">{(diffQuery.error as Error).message}</Alert>
            ) : (
              <Stack spacing={1.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  {diffQuery.data?.stat || 'No changes'}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    p: 1.5,
                    bgcolor: 'rgba(0,0,0,0.35)',
                    borderRadius: 2,
                    overflow: 'auto',
                    fontSize: 13,
                    m: 0,
                  }}
                >
                  {diffQuery.data?.patch || 'No diff available'}
                </Box>
              </Stack>
            )}
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 1.5, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {eventsQuery.isLoading ? (
              <CircularProgress />
            ) : eventsQuery.data?.length === 0 ? (
              <Typography color="text.secondary">No events yet.</Typography>
            ) : (
              <Stack spacing={1} divider={<Divider flexItem />}>
                {eventsQuery.data?.map((event) => (
                  <Box key={event.id}>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(event.createdAt).toLocaleString()} • {event.type}
                    </Typography>
                    <Box
                      component="pre"
                      sx={{ m: 0, mt: 0.5, fontSize: 12, whiteSpace: 'pre-wrap' }}
                    >
                      {JSON.stringify(event.data, null, 2)}
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Paper>

      <Dialog open={prOpen} onClose={() => setPrOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create pull request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={prBody}
              onChange={(e) => setPrBody(e.target.value)}
              fullWidth
              multiline
              minRows={4}
            />
            {createPrMutation.error && (
              <Alert severity="error">{(createPrMutation.error as Error).message}</Alert>
            )}
            {createPrMutation.data && (
              <Alert severity="success">
                PR #{createPrMutation.data.number} created: {createPrMutation.data.htmlUrl}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrOpen(false)}>Close</Button>
          <Button
            variant="contained"
            disabled={!prTitle || createPrMutation.isPending}
            onClick={() => createPrMutation.mutate()}
          >
            {createPrMutation.isPending ? 'Creating…' : 'Create PR'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={archiveOpen}
        title="Archive agent?"
        description="This archives the agent so it no longer appears as active. You can still view its history."
        confirmLabel="Archive"
        loading={archiveMutation.isPending}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => archiveMutation.mutate()}
      />
    </Stack>
  );
}
