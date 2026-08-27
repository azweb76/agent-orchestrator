import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentStatus, SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { statusColor } from '../theme';
import { statusLabel } from '../utils/format';
import { pullRequestPath } from '../utils/paths';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function flattenAgents(
  workspaces: SidebarWorkspace[],
): Array<SidebarAgent & { workspaceName: string; workspaceId: string }> {
  return workspaces.flatMap((workspace) =>
    workspace.agents.map((agent) => ({
      ...agent,
      workspaceName: workspace.name,
      workspaceId: workspace.id,
    })),
  );
}

function HudPanel({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        position: 'relative',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'rgba(18,24,38,0.72)',
        backdropFilter: 'blur(10px)',
        borderRadius: 2,
        p: 2.5,
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, rgba(94,234,212,0.05) 0%, transparent 42%, rgba(139,164,255,0.04) 100%)',
          pointerEvents: 'none',
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function MetricTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: { xs: 0, sm: 110 },
        py: 1.5,
        px: { xs: 1.5, sm: 2 },
        borderLeft: '2px solid',
        borderColor: accent ?? 'secondary.main',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontFamily: '"IBM Plex Mono", monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          display: 'block',
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="h4"
        sx={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontWeight: 600,
          lineHeight: 1.1,
          color: accent ?? 'text.primary',
          fontSize: { xs: '1.5rem', sm: '2rem' },
        }}
      >
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        fontFamily: '"IBM Plex Mono", monospace',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'text.secondary',
      }}
    >
      {children}
    </Typography>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [pruneOpen, setPruneOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: 30_000,
  });

  const pruneMutation = useMutation({
    mutationFn: () => api.pruneArchivedAgents(),
    onSuccess: () => {
      setPruneOpen(false);
      queryClient.invalidateQueries({ queryKey: ['status'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
    },
  });

  const {
    data: sidebar,
    isLoading: sidebarLoading,
    error: sidebarError,
  } = useQuery({
    queryKey: ['sidebar'],
    queryFn: api.listSidebar,
    // SSE invalidation keeps this fresh; the interval is a fallback.
    refetchInterval: 30_000,
  });

  const { data: workspaces, isLoading: workspacesLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
  });

  const inboxQuery = useQuery({
    queryKey: ['pulls-inbox'],
    queryFn: api.getPullRequestInbox,
    enabled: Boolean(status?.githubTokenConfigured),
    refetchInterval: 60_000,
  });

  const agents = useMemo(() => flattenAgents(sidebar ?? []), [sidebar]);
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status !== 'archived'),
    [agents],
  );
  const runningCount = activeAgents.filter((a) => a.status === 'running').length;
  const idleCount = activeAgents.filter((a) => a.status === 'idle').length;

  const prCount =
    (inboxQuery.data?.authored.length ?? 0) + (inboxQuery.data?.reviewRequested.length ?? 0);

  const systemsOk = Boolean(status?.claudeInstalled && status?.githubTokenConfigured);
  const systemsPartial = Boolean(status?.claudeInstalled || status?.githubTokenConfigured);

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...activeAgents].sort((a, b) => {
        const rank = (s: AgentStatus) =>
          s === 'running' ? 0 : s === 'idle' ? 1 : s === 'stopped' ? 2 : 3;
        return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
      });
    }
    return activeAgents.filter((agent) => {
      const haystack = `${agent.name} ${agent.workspaceName} ${agent.worktree.branch}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [activeAgents, query]);

  const recentWorkspaces = workspaces?.slice(0, 6) ?? [];
  const recentPrs = [
    ...(inboxQuery.data?.authored ?? []).slice(0, 3),
    ...(inboxQuery.data?.reviewRequested ?? []).slice(0, 2),
  ].slice(0, 5);
  const archivedCount = status?.archivedAgentCount ?? 0;

  const clock = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateLabel = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const onCommandSubmit = (event: FormEvent) => {
    event.preventDefault();
    const first = filteredAgents[0];
    if (first) navigate(`/agents/${first.id}`);
  };

  return (
    <Stack spacing={2.5}>
      <Box
        sx={{
          position: 'relative',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
          px: { xs: 2, md: 3.5 },
          py: { xs: 2.25, md: 3.5 },
          background:
            'radial-gradient(ellipse 80% 70% at 15% 20%, rgba(94,234,212,0.12), transparent 55%), radial-gradient(ellipse 60% 80% at 90% 10%, rgba(139,164,255,0.1), transparent 50%), linear-gradient(180deg, rgba(18,24,38,0.95), rgba(11,15,23,0.88))',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-end' } }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'secondary.main',
                display: 'block',
                mb: 1,
              }}
            >
              Command center
            </Typography>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 700,
                letterSpacing: '-0.03em',
                fontSize: { xs: '1.75rem', md: '2.2rem' },
                mb: 0.75,
              }}
            >
              {greetingForHour(now.getHours())}, Dan
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 520, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              {systemsOk
                ? 'All systems nominal. Jump into an agent or scan your PR inbox.'
                : systemsPartial
                  ? 'Partial systems online — check Claude Code and GitHub connectivity.'
                  : 'Configure Claude Code and a GitHub token to get started.'}
            </Typography>
          </Box>

          <Stack spacing={0.5} sx={{ alignItems: { xs: 'flex-start', md: 'flex-end' }, flexShrink: 0 }}>
            <Typography
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: { xs: '1.35rem', md: '1.65rem' },
                fontWeight: 500,
                color: 'secondary.main',
                letterSpacing: '0.04em',
                animation: 'ao-clock-glow 3s ease-in-out infinite',
                '@keyframes ao-clock-glow': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.72 },
                },
              }}
            >
              {clock}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontFamily: '"IBM Plex Mono", monospace', color: 'text.secondary' }}
            >
              {dateLabel}
            </Typography>
          </Stack>
        </Stack>

        <Box component="form" onSubmit={onCommandSubmit} sx={{ mt: 2.5, maxWidth: 640 }}>
          <TextField
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an agent, workspace, or branch…"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                'aria-label': 'Search agents',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(11,15,23,0.55)',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.9rem',
              },
            }}
          />
        </Box>

        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: 'wrap' }}>
          <Button
            component={RouterLink}
            to="/workspaces"
            variant="contained"
            startIcon={<FolderOpenOutlinedIcon />}
            size="small"
          >
            Workspaces
          </Button>
          <Button
            component={RouterLink}
            to="/pull-requests"
            variant="outlined"
            startIcon={<MergeTypeIcon />}
            size="small"
          >
            Pull requests
          </Button>
          {archivedCount > 0 ? (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<DeleteSweepOutlinedIcon />}
              size="small"
              onClick={() => {
                pruneMutation.reset();
                setPruneOpen(true);
              }}
            >
              Prune archived ({archivedCount})
            </Button>
          ) : null}
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'rgba(18,24,38,0.55)',
          overflow: 'hidden',
          '& > *:nth-of-type(odd)': {
            borderRight: { xs: '1px solid', md: 'none' },
            borderColor: 'divider',
          },
          '& > *:nth-of-type(n + 3)': {
            borderTop: { xs: '1px solid', md: 'none' },
            borderColor: 'divider',
          },
          '& > * + *': {
            borderLeft: { md: '1px solid' },
            borderColor: 'divider',
          },
        }}
      >
        <MetricTile label="Running" value={runningCount} hint="Active runs" accent="info.main" />
        <MetricTile label="Ready" value={idleCount} hint="Idle agents" accent="success.main" />
        <MetricTile label="Workspaces" value={workspaces?.length ?? 0} hint="Local repos" />
        <MetricTile
          label="Open PRs"
          value={status?.githubTokenConfigured ? prCount : '—'}
          hint={status?.githubTokenConfigured ? 'Authored + reviews' : 'GitHub not connected'}
          accent="secondary.main"
        />
      </Box>

      {(sidebarError as Error | undefined) && (
        <Alert severity="error">{(sidebarError as Error).message}</Alert>
      )}

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ alignItems: 'stretch' }}>
        <HudPanel sx={{ flex: 1.4, minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
          >
            <Box>
              <SectionLabel>Agent fleet</SectionLabel>
              <Typography variant="h6">Live agents</Typography>
            </Box>
            {runningCount > 0 ? (
              <Chip size="small" color="info" label={`${runningCount} running`} variant="outlined" />
            ) : (
              <Chip size="small" label={`${activeAgents.length} total`} variant="outlined" />
            )}
          </Stack>

          {sidebarLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : filteredAgents.length === 0 ? (
            <EmptyState
              compact
              icon={<SmartToyOutlinedIcon />}
              title={query ? 'No agents match' : 'No agents yet'}
              description={
                query
                  ? 'Try a different name, workspace, or branch.'
                  : 'Create a worktree from a workspace to spin up an agent.'
              }
              action={
                !query ? (
                  <Button
                    component={RouterLink}
                    to="/workspaces"
                    variant="contained"
                    size="small"
                    startIcon={<FolderOpenOutlinedIcon />}
                  >
                    Open workspaces
                  </Button>
                ) : null
              }
            />
          ) : (
            <Stack spacing={0.75}>
              {filteredAgents.slice(0, 10).map((agent) => (
                <Box
                  key={agent.id}
                  component={RouterLink}
                  to={`/agents/${agent.id}`}
                  sx={{
                    display: 'block',
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    px: 1.75,
                    py: 1.25,
                    transition: 'border-color 0.2s ease, background-color 0.2s ease',
                    '&:hover': {
                      borderColor: 'rgba(94,234,212,0.35)',
                      bgcolor: 'rgba(94,234,212,0.04)',
                    },
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'secondary.main',
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor:
                          agent.status === 'running'
                            ? 'info.main'
                            : agent.status === 'idle'
                              ? 'success.main'
                              : 'warning.main',
                        boxShadow:
                          agent.status === 'running' ? '0 0 0 3px rgba(139,164,255,0.25)' : 'none',
                        animation:
                          agent.status === 'running' ? 'ao-pulse 1.4s ease-in-out infinite' : 'none',
                        '@keyframes ao-pulse': {
                          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                          '50%': { opacity: 0.65, transform: 'scale(0.85)' },
                        },
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {agent.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {agent.workspaceName} · {agent.worktree.branch}
                      </Typography>
                      {agent.status === 'running' ? (
                        <LinearProgress
                          color="info"
                          sx={{
                            mt: 0.75,
                            height: 2,
                            borderRadius: 1,
                            bgcolor: 'rgba(139,164,255,0.12)',
                          }}
                        />
                      ) : null}
                    </Box>
                    <Chip
                      size="small"
                      label={statusLabel(agent.status)}
                      color={statusColor(agent.status)}
                      variant="outlined"
                      sx={{ flexShrink: 0 }}
                    />
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </HudPanel>

        <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
          <HudPanel>
            <SectionLabel>Systems</SectionLabel>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Readiness
            </Typography>
            <Stack spacing={1.25}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">Claude Code</Typography>
                <Chip
                  size="small"
                  label={status?.claudeInstalled ? 'Online' : 'Missing'}
                  color={status?.claudeInstalled ? 'success' : 'warning'}
                  variant="outlined"
                />
              </Stack>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">GitHub</Typography>
                <Chip
                  size="small"
                  label={status?.githubTokenConfigured ? 'Connected' : 'No token'}
                  color={status?.githubTokenConfigured ? 'success' : 'default'}
                  variant="outlined"
                />
              </Stack>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">Fleet</Typography>
                <Chip
                  size="small"
                  label={
                    runningCount > 0 ? 'Engaged' : activeAgents.length > 0 ? 'Standing by' : 'Empty'
                  }
                  color={runningCount > 0 ? 'info' : 'default'}
                  variant="outlined"
                />
              </Stack>
              {archivedCount > 0 ? (
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Archived</Typography>
                  <Chip
                    size="small"
                    label={`${archivedCount} to prune`}
                    color="warning"
                    variant="outlined"
                    onClick={() => {
                      pruneMutation.reset();
                      setPruneOpen(true);
                    }}
                    sx={{ cursor: 'pointer' }}
                  />
                </Stack>
              ) : null}
            </Stack>
          </HudPanel>

          <HudPanel>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box>
                <SectionLabel>Repositories</SectionLabel>
                <Typography variant="h6">Workspaces</Typography>
              </Box>
              <Button component={RouterLink} to="/workspaces" size="small">
                View all
              </Button>
            </Stack>

            {workspacesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : recentWorkspaces.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                No workspaces yet. Clone a repo to begin.
              </Typography>
            ) : (
              <Stack spacing={0}>
                {recentWorkspaces.map((workspace) => (
                  <Box
                    key={workspace.id}
                    component={RouterLink}
                    to={`/workspaces/${workspace.id}`}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 1,
                      textDecoration: 'none',
                      color: 'inherit',
                      py: 0.9,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                      '&:hover .ws-name': { color: 'secondary.main' },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography className="ws-name" variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {workspace.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {workspace.githubOwner}/{workspace.githubRepo}
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: '"IBM Plex Mono", monospace',
                        color: 'text.secondary',
                        flexShrink: 0,
                      }}
                    >
                      {workspace.agentCount}a · {workspace.worktreeCount}w
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </HudPanel>

          <HudPanel>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box>
                <SectionLabel>Inbox</SectionLabel>
                <Typography variant="h6">Pull requests</Typography>
              </Box>
              <Button component={RouterLink} to="/pull-requests" size="small">
                Open inbox
              </Button>
            </Stack>

            {!status?.githubTokenConfigured ? (
              <Typography color="text.secondary" variant="body2">
                Set <code>GITHUB_TOKEN</code> to load your PR inbox.
              </Typography>
            ) : inboxQuery.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : recentPrs.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                No open authored PRs or review requests.
              </Typography>
            ) : (
              <Stack spacing={0}>
                {recentPrs.map((pr) => (
                  <Box
                    key={`${pr.owner}/${pr.repo}#${pr.number}`}
                    component={RouterLink}
                    to={pullRequestPath(pr.owner, pr.repo, pr.number)}
                    sx={{
                      display: 'block',
                      textDecoration: 'none',
                      color: 'inherit',
                      py: 0.9,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                      '&:hover .pr-title': { color: 'secondary.main' },
                    }}
                  >
                    <Typography className="pr-title" variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      #{pr.number} {pr.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {pr.owner}/{pr.repo} · {pr.category === 'authored' ? 'authored' : 'review'}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </HudPanel>
        </Stack>
      </Stack>

      <ConfirmDialog
        open={pruneOpen}
        title="Prune archived agents?"
        description={
          archivedCount === 1
            ? 'This permanently deletes 1 archived agent and removes any worktrees that are no longer in use. Active agents are not affected.'
            : `This permanently deletes ${archivedCount} archived agents and removes any worktrees that are no longer in use. Active agents are not affected.`
        }
        confirmLabel="Prune archived"
        confirmColor="warning"
        loading={pruneMutation.isPending}
        onCancel={() => {
          setPruneOpen(false);
          pruneMutation.reset();
        }}
        onConfirm={() => pruneMutation.mutate()}
      />
    </Stack>
  );
}
