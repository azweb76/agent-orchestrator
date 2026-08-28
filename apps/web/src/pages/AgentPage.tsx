import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentDiffScope, ChatSessionTemplateId } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { useSseConnectionState } from '../api/events';
import { SSE_FALLBACK_ACTIVE_POLL_MS } from '../api/ssePolling';
import { ArchiveAgentDialog } from '../components/ArchiveAgentDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AgentChangesPanel } from '../components/changes/AgentChangesPanel';
import { ChatPanel } from '../components/chat/ChatPanel';
import { ControlTooltip } from '../components/ui/ControlTooltip';
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
  const locationState = location.state as {
    initialPrompt?: string;
    sessionTemplate?: ChatSessionTemplateId;
  } | null;
  const [initialPrompt] = useState(() => locationState?.initialPrompt?.trim() || undefined);
  const [initialTemplate] = useState(() => locationState?.sessionTemplate);
  const [tab, setTab] = useState(0);
  const [diffScope, setDiffScope] = useState<AgentDiffScope>('pending');
  const [prOpen, setPrOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitPush, setCommitPush] = useState(true);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prDraft, setPrDraft] = useState(true);
  const sseState = useSseConnectionState();

  // Consume one-shot navigation state so refresh does not re-send the idea.
  useEffect(() => {
    if (!locationState?.initialPrompt && !locationState?.sessionTemplate) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, locationState?.initialPrompt, locationState?.sessionTemplate, navigate]);

  const agentQuery = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.getAgent(agentId),
    enabled: Boolean(agentId),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (sseState === 'connected') return false;
      const data = query.state.data;
      if (!data) return false;
      if (data.status === 'running') return SSE_FALLBACK_ACTIVE_POLL_MS;
      if (data.sessions?.some((item) => item.status === 'running')) {
        return SSE_FALLBACK_ACTIVE_POLL_MS;
      }
      return false;
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (deleteWorktree: boolean) => api.archiveAgent(agentId, { deleteWorktree }),
    onSuccess: (result) => {
      setArchiveOpen(false);
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      if (result.deletedWorktree) {
        const detail = queryClient.getQueryData<{ workspace: { id: string } }>(['agent', agentId]);
        navigate(detail?.workspace.id ? `/workspaces/${detail.workspace.id}` : '/');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => api.unarchiveAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAgent(agentId, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      const detail = queryClient.getQueryData<{ workspace: { id: string } }>(['agent', agentId]);
      navigate(detail?.workspace.id ? `/workspaces/${detail.workspace.id}` : '/');
    },
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      api.commitChanges(agentId, { message: commitMessage.trim(), push: commitPush }),
    onSuccess: () => {
      setCommitOpen(false);
      setCommitMessage('');
      queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const openCommitDialog = () => {
    commitMutation.reset();
    setCommitMessage('');
    setCommitPush(true);
    setCommitOpen(true);
  };

  const createPrMutation = useMutation({
    mutationFn: () => api.createPr(agentId, { title: prTitle, body: prBody, draft: prDraft }),
    onSuccess: (pr) => {
      setPrOpen(false);
      setPrTitle('');
      setPrBody('');
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      const workspace = agentQuery.data?.workspace;
      if (workspace) {
        navigate(pullRequestPath(workspace.githubOwner, workspace.githubRepo, pr.number));
      }
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
          {archived ? (
            <>
              <ControlTooltip title="Restore this agent to the active fleet" disabled={unarchiveMutation.isPending}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<UnarchiveOutlinedIcon />}
                  disabled={unarchiveMutation.isPending}
                  onClick={() => unarchiveMutation.mutate()}
                >
                  Unarchive
                </Button>
              </ControlTooltip>
              <ControlTooltip
                title="Permanently delete this agent and its chat history"
                disabled={deleteMutation.isPending}
              >
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlinedIcon />}
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    deleteMutation.reset();
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </Button>
              </ControlTooltip>
            </>
          ) : (
            <>
              <ControlTooltip title="Archive this agent and hide it from the active fleet" disabled={archiveMutation.isPending}>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<ArchiveOutlinedIcon />}
                  disabled={archiveMutation.isPending}
                  onClick={() => {
                    archiveMutation.reset();
                    setArchiveOpen(true);
                  }}
                >
                  Archive
                </Button>
              </ControlTooltip>
              <ControlTooltip
                title="Permanently delete this agent and its chat history"
                disabled={deleteMutation.isPending}
              >
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlinedIcon />}
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    deleteMutation.reset();
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </Button>
              </ControlTooltip>
            </>
          )}
          {prNumber != null ? (
            <ControlTooltip title={`Open pull request #${prNumber} in the app`}>
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
            </ControlTooltip>
          ) : (
            <ControlTooltip
              title={archived ? 'Archived agents cannot create pull requests' : 'Create a pull request for this branch'}
              disabled={archived}
            >
              <Button
                size="small"
                variant="contained"
                startIcon={<MergeTypeIcon />}
                disabled={archived}
                onClick={() => setPrOpen(true)}
              >
                Create PR
              </Button>
            </ControlTooltip>
          )}
        </Stack>
      </Stack>

      {(unarchiveMutation.error || deleteMutation.error) && (
        <Alert
          severity="error"
          onClose={() => {
            unarchiveMutation.reset();
            deleteMutation.reset();
          }}
        >
          {((unarchiveMutation.error ?? deleteMutation.error) as Error).message}
        </Alert>
      )}

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
          sx={{
            px: { xs: 0.5, sm: 1.5 },
            minHeight: 40,
            borderBottom: 1,
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Tab label="Chat" sx={{ minHeight: 40, py: 1 }} />
          <Tab label="Changes" sx={{ minHeight: 40, py: 1 }} />
        </Tabs>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: tab === 0 ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <ChatPanel
            agent={agent}
            archived={archived}
            initialPrompt={initialPrompt}
            initialTemplate={initialTemplate}
          />
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: tab === 1 ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          <AgentChangesPanel
            agentId={agentId}
            worktreePath={agent.worktree.path}
            archived={archived}
            diffScope={diffScope}
            onDiffScopeChange={setDiffScope}
            onCommitClick={openCommitDialog}
            enabled={tab === 1}
          />
        </Box>
      </Paper>

      <ResponsiveDialog open={prOpen} onClose={() => setPrOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create pull request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <ControlTooltip title="Title shown on the GitHub pull request">
              <TextField
                label="Title"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                fullWidth
                required
                autoFocus
              />
            </ControlTooltip>
            <ControlTooltip title="Optional description for the pull request body">
              <TextField
                label="Description"
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                fullWidth
                multiline
                minRows={4}
              />
            </ControlTooltip>
            <ControlTooltip title="Keep the pull request as a draft on GitHub">
              <FormControlLabel
                control={
                  <Checkbox checked={prDraft} onChange={(e) => setPrDraft(e.target.checked)} />
                }
                label="Open as draft"
              />
            </ControlTooltip>
            {createPrMutation.error && (
              <Alert severity="error">{(createPrMutation.error as Error).message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <ControlTooltip title="Close without creating a pull request">
            <Button onClick={() => setPrOpen(false)}>Close</Button>
          </ControlTooltip>
          <ControlTooltip
            title={
              createPrMutation.isPending
                ? 'Creating pull request on GitHub…'
                : !prTitle
                  ? 'Enter a title first'
                  : 'Create pull request on GitHub'
            }
            disabled={!prTitle || createPrMutation.isPending}
          >
            <Button
              variant="contained"
              disabled={!prTitle || createPrMutation.isPending}
              onClick={() => createPrMutation.mutate()}
            >
              {createPrMutation.isPending ? 'Creating…' : 'Create PR'}
            </Button>
          </ControlTooltip>
        </DialogActions>
      </ResponsiveDialog>

      <ArchiveAgentDialog
        open={archiveOpen}
        agentName={agent.name}
        worktreeName={agent.worktree.name}
        loading={archiveMutation.isPending}
        error={archiveMutation.error ? (archiveMutation.error as Error).message : null}
        onCancel={() => {
          setArchiveOpen(false);
          archiveMutation.reset();
        }}
        onConfirm={(deleteWorktree) => archiveMutation.mutate(deleteWorktree)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${agent.name}?`}
        description="This permanently deletes the agent and its chat history. The git worktree is kept on disk."
        confirmLabel="Delete agent"
        loading={deleteMutation.isPending}
        onCancel={() => {
          setDeleteOpen(false);
          deleteMutation.reset();
        }}
        onConfirm={() => deleteMutation.mutate()}
      />

      <ResponsiveDialog
        open={commitOpen}
        onClose={() => {
          if (commitMutation.isPending) return;
          setCommitOpen(false);
          commitMutation.reset();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Commit changes</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <ControlTooltip title="Message for the git commit">
              <TextField
                label="Commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                fullWidth
                required
                autoFocus
                multiline
                minRows={2}
              />
            </ControlTooltip>
            <ControlTooltip title="Push the commit to origin after committing locally">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={commitPush}
                    onChange={(event) => setCommitPush(event.target.checked)}
                  />
                }
                label="Push to origin after committing"
              />
            </ControlTooltip>
            {commitMutation.error ? (
              <Alert severity="error">{(commitMutation.error as Error).message}</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <ControlTooltip title="Close without committing" disabled={commitMutation.isPending}>
            <Button
              onClick={() => {
                setCommitOpen(false);
                commitMutation.reset();
              }}
              disabled={commitMutation.isPending}
            >
              Cancel
            </Button>
          </ControlTooltip>
          <ControlTooltip
            title={
              commitMutation.isPending
                ? 'Committing changes…'
                : !commitMessage.trim()
                  ? 'Enter a commit message first'
                  : commitPush
                    ? 'Commit pending changes and push to origin'
                    : 'Commit pending changes locally'
            }
            disabled={!commitMessage.trim() || commitMutation.isPending}
          >
            <Button
              variant="contained"
              disabled={!commitMessage.trim() || commitMutation.isPending}
              onClick={() => commitMutation.mutate()}
            >
              {commitMutation.isPending ? 'Working…' : commitPush ? 'Commit and push' : 'Commit'}
            </Button>
          </ControlTooltip>
        </DialogActions>
      </ResponsiveDialog>
    </Stack>
  );
}
