import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CLAUDE_MODELS, PERMISSION_MODES, type PermissionMode } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { ChatPanel } from '../components/chat/ChatPanel';
import { statusColor } from '../theme';

export function AgentPage() {
  const { agentId = '' } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [prOpen, setPrOpen] = useState(false);
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
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

  const createPrMutation = useMutation({
    mutationFn: () => api.createPr(agentId, { title: prTitle, body: prBody }),
    onSuccess: () => {
      setPrOpen(false);
      queryClient.invalidateQueries({ queryKey: ['events', agentId] });
    },
  });

  useEffect(() => {
    setEnvironment(agentQuery.data?.environment ?? '');
  }, [agentQuery.data?.environment]);

  if (agentQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (agentQuery.error || !agentQuery.data) {
    return <Alert severity="error">{(agentQuery.error as Error)?.message ?? 'Agent not found'}</Alert>;
  }

  const agent = agentQuery.data;
  const archived = Boolean(agent.archivedAt);

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ justifyContent: 'space-between' }}
          >
            <Box>
              <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                <Typography variant="h4">{agent.name}</Typography>
                <Chip label={agent.status} color={statusColor(agent.status)} />
              </Stack>
              <Typography color="text.secondary">
                {agent.workspace.githubOwner}/{agent.workspace.githubRepo} • {agent.worktree.name} •{' '}
                {agent.worktree.branch}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Model</InputLabel>
                <Select
                  label="Model"
                  value={agent.model}
                  disabled={archived}
                  onChange={(e) => updateMutation.mutate({ model: e.target.value })}
                >
                  {CLAUDE_MODELS.map((model) => (
                    <MenuItem key={model.id} value={model.id}>
                      {model.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel>Permissions</InputLabel>
                <Select
                  label="Permissions"
                  value={agent.permissionMode ?? 'bypassPermissions'}
                  disabled={archived}
                  onChange={(e) =>
                    updateMutation.mutate({ permissionMode: e.target.value as PermissionMode })
                  }
                >
                  {PERMISSION_MODES.map((mode) => (
                    <MenuItem key={mode.id} value={mode.id}>
                      {mode.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                size="small"
                label="Environment ID"
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
                sx={{ minWidth: 180 }}
              />

              <Button
                variant="outlined"
                startIcon={<PlayArrowIcon />}
                disabled={archived || startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                Start
              </Button>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<StopIcon />}
                disabled={archived || stopMutation.isPending}
                onClick={() => stopMutation.mutate()}
              >
                Stop
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<ArchiveOutlinedIcon />}
                disabled={archived || archiveMutation.isPending}
                onClick={() => {
                  if (confirm('Archive this agent?')) archiveMutation.mutate();
                }}
              >
                Archive
              </Button>
              <Button
                variant="contained"
                startIcon={<MergeTypeIcon />}
                disabled={archived}
                onClick={() => setPrOpen(true)}
              >
                Create PR
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Chat" />
          <Tab label="Diff" />
          <Tab label="Events" />
        </Tabs>

        {tab === 0 && <ChatPanel agent={agent} archived={archived} />}

        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            {diffQuery.isLoading ? (
              <CircularProgress />
            ) : diffQuery.error ? (
              <Alert severity="error">{(diffQuery.error as Error).message}</Alert>
            ) : (
              <Stack spacing={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  {diffQuery.data?.stat || 'No changes'}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    p: 2,
                    bgcolor: 'rgba(0,0,0,0.35)',
                    borderRadius: 2,
                    overflow: 'auto',
                    maxHeight: 520,
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
          <Box sx={{ p: 2, maxHeight: 560, overflowY: 'auto' }}>
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
    </Stack>
  );
}
