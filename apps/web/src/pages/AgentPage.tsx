import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentDiffScope } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { ChangesDiffView } from '../components/changes/ChangesDiffView';
import { ChatPanel } from '../components/chat/ChatPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageBreadcrumbs } from '../components/ui/PageBreadcrumbs';
import { ResponsiveDialog } from '../components/ui/ResponsiveDialog';
import { statusColor } from '../theme';
import { statusLabel } from '../utils/format';
import { pullRequestPath } from '../utils/paths';

export function AgentPage() {
  const { agentId = '' } = useParams();
  // Remount when the route agent changes so header/chat local state cannot leak
  // across agents (React Router keeps the same route element instance otherwise).
  return <AgentPageContent key={agentId} agentId={agentId} />;
}

function AgentPageContent({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as { initialPrompt?: string } | null;
  const [initialPrompt] = useState(() => locationState?.initialPrompt?.trim() || undefined);
  const [tab, setTab] = useState(0);
  const [diffScope, setDiffScope] = useState<AgentDiffScope>('pending');
  const [prOpen, setPrOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');

  // Consume one-shot navigation state so refresh does not re-send the idea.
  useEffect(() => {
    if (!locationState?.initialPrompt) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, locationState?.initialPrompt, navigate]);

  const agentQuery = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.getAgent(agentId),
    enabled: Boolean(agentId),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2000 : false),
  });

  const diffQuery = useQuery({
    queryKey: ['diff', agentId, diffScope],
    queryFn: () => api.getDiff(agentId, diffScope),
    enabled: Boolean(agentId) && tab === 1,
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
      queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    },
  });

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
    <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
      <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
        <PageBreadcrumbs
          items={[
            { label: 'Workspaces', to: '/workspaces' },
            { label: agent.workspace.name, to: `/workspaces/${agent.workspace.id}` },
            { label: agent.name },
          ]}
        />
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, flexShrink: 0 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: { xs: '1.2rem', md: '1.4rem' } }}>
              {agent.name}
            </Typography>
            <Chip
              size="small"
              label={statusLabel(agent.status)}
              color={statusColor(agent.status)}
              variant="outlined"
            />
            {prNumber != null && (
              <Chip
                size="small"
                label={
                  agent.worktree.prTitle
                    ? `PR #${prNumber}: ${agent.worktree.prTitle}`
                    : `PR #${prNumber}`
                }
                color="info"
                variant="outlined"
                component="a"
                href={prUrl!}
                target="_blank"
                rel="noopener noreferrer"
                clickable
                sx={{ maxWidth: { xs: '100%', sm: 360 } }}
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            <Box
              component={RouterLink}
              to={`/workspaces/${agent.workspace.id}`}
              sx={{
                color: 'inherit',
                textDecoration: 'none',
                '&:hover': { color: 'secondary.main' },
              }}
            >
              {agent.workspace.githubOwner}/{agent.workspace.githubRepo}
            </Box>
            {' · '}
            {agent.worktree.name} · {agent.worktree.branch}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
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
          {prNumber != null ? (
            <Button
              size="small"
              variant="contained"
              component={RouterLink}
              startIcon={<MergeTypeIcon />}
              to={pullRequestPath(
                agent.workspace.githubOwner,
                agent.workspace.githubRepo,
                prNumber,
              )}
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
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ px: { xs: 0.5, sm: 1.5 }, minHeight: 40, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
        >
          <Tab label="Chat" sx={{ minHeight: 40, py: 1 }} />
          <Tab label="Changes" sx={{ minHeight: 40, py: 1 }} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ChatPanel agent={agent} archived={archived} initialPrompt={initialPrompt} />
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 1.5, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', flexShrink: 0 }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Local path
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 12,
                      wordBreak: 'break-all',
                    }}
                  >
                    {agent.worktree.path}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={diffScope}
                    onChange={(_, value: AgentDiffScope | null) => {
                      if (value) setDiffScope(value);
                    }}
                    aria-label="Change scope"
                  >
                    <ToggleButton value="pending">Pending</ToggleButton>
                    <ToggleButton value="pr">All PR changes</ToggleButton>
                  </ToggleButtonGroup>
                  <Tooltip title="Refresh">
                    <span>
                      <IconButton
                        size="small"
                        aria-label="Refresh changes"
                        onClick={() => diffQuery.refetch()}
                        disabled={diffQuery.isFetching}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>

              {diffQuery.isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : diffQuery.error ? (
                <Alert severity="error">{(diffQuery.error as Error).message}</Alert>
              ) : !diffQuery.data?.patch ? (
                <EmptyState
                  compact
                  title={diffScope === 'pending' ? 'No pending changes' : 'No PR changes'}
                  description={
                    diffScope === 'pending'
                      ? 'The working tree matches HEAD. Switch to All PR changes to see commits on this branch.'
                      : 'No differences from the base branch.'
                  }
                />
              ) : (
                <ChangesDiffView patch={diffQuery.data.patch} />
              )}
            </Stack>
          </Box>
        )}
      </Paper>

      <ResponsiveDialog open={prOpen} onClose={() => setPrOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create pull request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              fullWidth
              required
              autoFocus
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
      </ResponsiveDialog>

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
