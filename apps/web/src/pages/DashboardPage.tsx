import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
  useTheme,
} from '@mui/material';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import NotificationImportantOutlinedIcon from '@mui/icons-material/NotificationImportantOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentStatus, SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { useSseConnectionState } from '../api/events';
import { useSsePollingFallback } from '../api/ssePolling';
import { useCommandPalette } from '../components/commandPalette/CommandPaletteContext';
import { paletteShortcutLabel } from '../components/commandPalette/paletteCommands';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { statusColor } from '../theme';
import { formatBytes, formatUsd, statusLabel } from '../utils/format';
import { CommandCenterHero } from '../components/dashboard/CommandCenterHero';
import { JarvisBriefing } from '../components/dashboard/JarvisBriefing';
import { pullRequestPath } from '../utils/paths';

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
  const theme = useTheme();
  const ao = theme.palette.ao;

  return (
    <Box
      sx={{
        position: 'relative',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: ao.surface.panel,
        backdropFilter: 'blur(10px)',
        borderRadius: 2,
        p: 2.5,
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: ao.gradient.panelSheen,
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
  const { openPalette } = useCommandPalette();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [pruneOpen, setPruneOpen] = useState(false);
  const sseState = useSseConnectionState();
  const sseFallback = useSsePollingFallback();

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: sseFallback,
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
    refetchInterval: (query) => {
      if (sseState === 'connected') return false;
      const data = query.state.data;
      if (!data) return 15_000;
      const running = data.some((ws) => ws.agents.some((agent) => agent.status === 'running'));
      return running ? 15_000 : sseFallback || false;
    },
  });

  const { data: workspaces, isLoading: workspacesLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
  });

  const inboxQuery = useQuery({
    queryKey: ['pulls-inbox'],
    queryFn: api.getPullRequestInbox,
    enabled: Boolean(status?.githubTokenConfigured),
    refetchInterval: sseFallback,
  });

  const usageQuery = useQuery({
    queryKey: ['usage'],
    queryFn: api.getUsageSummary,
    refetchInterval: sseFallback,
  });

  const agents = useMemo(() => flattenAgents(sidebar ?? []), [sidebar]);
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status !== 'archived'),
    [agents],
  );
  const runningCount = activeAgents.filter((a) => a.status === 'running').length;
  const idleCount = activeAgents.filter((a) => a.status === 'idle').length;
  const blockedAgents = useMemo(
    () => activeAgents.filter((agent) => (agent.pendingPermissionCount ?? 0) > 0),
    [activeAgents],
  );

  const prCount =
    (inboxQuery.data?.authored.length ?? 0) + (inboxQuery.data?.reviewRequested.length ?? 0);

  const systemsOk = Boolean(status?.claudeInstalled && status?.githubTokenConfigured);
  const systemsPartial = Boolean(status?.claudeInstalled || status?.githubTokenConfigured);

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...activeAgents].sort((a, b) => {
        const blocked = (agent: (typeof activeAgents)[number]) =>
          (agent.pendingPermissionCount ?? 0) > 0 ? 0 : 1;
        const rank = (s: AgentStatus) =>
          s === 'running' ? 0 : s === 'idle' ? 1 : s === 'stopped' ? 2 : 3;
        return (
          blocked(a) - blocked(b) ||
          rank(a.status) - rank(b.status) ||
          a.name.localeCompare(b.name)
        );
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

  const theme = useTheme();
  const ao = theme.palette.ao;

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
          background: ao.gradient.hero,
        }}
      >
        <CommandCenterHero githubLogin={status?.githubLogin} />

        <JarvisBriefing
          systemsOk={systemsOk}
          systemsPartial={systemsPartial}
          githubConfigured={Boolean(status?.githubTokenConfigured)}
          agents={activeAgents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            workspaceName: agent.workspaceName,
            status: agent.status,
            pendingPermissionCount: agent.pendingPermissionCount ?? 0,
          }))}
          inbox={inboxQuery.data}
        />

        <Box component="form" onSubmit={onCommandSubmit} sx={{ mt: 2.5, maxWidth: 640 }}>
          <ControlTooltip title="Search agents by name, workspace, or branch">
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
                  endAdornment: (
                    <InputAdornment position="end">
                      <ControlTooltip title={`Open the command palette (${paletteShortcutLabel()})`}>
                        <Button
                          size="small"
                          onClick={openPalette}
                          aria-label="Open command palette"
                          sx={{
                            minWidth: 0,
                            px: 1,
                            color: 'text.secondary',
                            fontFamily: '"IBM Plex Mono", monospace',
                            fontSize: '0.75rem',
                          }}
                        >
                          {paletteShortcutLabel()}
                        </Button>
                      </ControlTooltip>
                    </InputAdornment>
                  ),
                  'aria-label': 'Search agents',
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'ao.surface.overlay',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.9rem',
                },
              }}
            />
          </ControlTooltip>
        </Box>

        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: 'wrap' }}>
          <ControlTooltip title="Browse and manage cloned repositories">
            <Button
              component={RouterLink}
              to="/workspaces"
              variant="contained"
              startIcon={<FolderOpenOutlinedIcon />}
              size="small"
            >
              Workspaces
            </Button>
          </ControlTooltip>
          <ControlTooltip title="Open your pull request inbox">
            <Button
              component={RouterLink}
              to="/pull-requests"
              variant="outlined"
              startIcon={<MergeTypeIcon />}
              size="small"
            >
              Pull requests
            </Button>
          </ControlTooltip>
          {archivedCount > 0 ? (
            <ControlTooltip title={`Permanently delete ${archivedCount} archived agent${archivedCount === 1 ? '' : 's'}`}>
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
            </ControlTooltip>
          ) : null}
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'ao.surface.panelMuted',
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
        <MetricTile
          label="Spend today"
          value={usageQuery.data ? formatUsd(usageQuery.data.todayCostUsd) : '—'}
          hint={usageQuery.data ? `${formatUsd(usageQuery.data.totalCostUsd)} all-time` : 'Loading…'}
          accent="warning.main"
        />
      </Box>

      {(sidebarError as Error | undefined) && (
        <Alert severity="error">{(sidebarError as Error).message}</Alert>
      )}

      {blockedAgents.length > 0 ? (
        <HudPanel
          sx={{
            borderColor: 'ao.accent.warningBorder',
            '&::before': {
              background: `linear-gradient(135deg, ${ao.accent.warningTintStrong} 0%, transparent 45%, ${ao.accent.warningTint} 100%)`,
            },
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
            <NotificationImportantOutlinedIcon sx={{ color: 'warning.main' }} />
            <Box>
              <SectionLabel>Needs attention</SectionLabel>
              <Typography variant="h6">
                {blockedAgents.length === 1
                  ? '1 agent is waiting on you'
                  : `${blockedAgents.length} agents are waiting on you`}
              </Typography>
            </Box>
          </Stack>
          <Stack spacing={0.75}>
            {blockedAgents.map((agent) => (
              <Box
                key={agent.id}
                component={RouterLink}
                to={`/agents/${agent.id}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  textDecoration: 'none',
                  color: 'inherit',
                  border: '1px solid',
                  borderColor: 'ao.accent.warningBorder',
                  borderRadius: 1.5,
                  px: 1.75,
                  py: 1,
                  transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  '&:hover': {
                    borderColor: 'warning.main',
                    bgcolor: 'ao.accent.warningTint',
                  },
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {agent.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {agent.workspaceName} · {agent.worktree.branch}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={
                    agent.pendingPermissionCount === 1
                      ? '1 pending prompt'
                      : `${agent.pendingPermissionCount} pending prompts`
                  }
                  sx={{ flexShrink: 0 }}
                />
              </Box>
            ))}
          </Stack>
        </HudPanel>
      ) : null}

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
                  <ControlTooltip title="Clone a repo and create your first agent">
                    <Button
                      component={RouterLink}
                      to="/workspaces"
                      variant="contained"
                      size="small"
                      startIcon={<FolderOpenOutlinedIcon />}
                    >
                      Open workspaces
                    </Button>
                  </ControlTooltip>
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
                      borderColor: 'ao.accent.secondaryBorder',
                      bgcolor: 'ao.accent.secondaryTint',
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
                          agent.status === 'running' ? `0 0 0 3px ${ao.accent.infoGlow}` : 'none',
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
                            bgcolor: 'ao.accent.infoTint',
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
              {typeof status?.dataDirBytes === 'number' ? (
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Data directory</Typography>
                  <Chip
                    size="small"
                    label={formatBytes(status.dataDirBytes)}
                    variant="outlined"
                  />
                </Stack>
              ) : null}
            </Stack>
          </HudPanel>

          {usageQuery.data && usageQuery.data.agents.length > 0 ? (
            <HudPanel>
              <Stack
                direction="row"
                sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}
              >
                <Box>
                  <SectionLabel>Usage</SectionLabel>
                  <Typography variant="h6">Top spend</Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: '"IBM Plex Mono", monospace', color: 'text.secondary' }}
                >
                  {formatUsd(usageQuery.data.totalCostUsd)} · {usageQuery.data.totalAssistantTurns}{' '}
                  turns
                </Typography>
              </Stack>
              <Stack spacing={0}>
                {usageQuery.data.agents.slice(0, 5).map((agent) => (
                  <Box
                    key={agent.agentId}
                    component={RouterLink}
                    to={`/agents/${agent.agentId}`}
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
                      '&:hover .usage-name': { color: 'secondary.main' },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        className="usage-name"
                        variant="body2"
                        noWrap
                        sx={{ fontWeight: 600 }}
                      >
                        {agent.agentName}
                        {agent.archived ? ' (archived)' : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {agent.workspaceName} · {agent.assistantTurns} turns
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: '"IBM Plex Mono", monospace',
                        color: 'warning.main',
                        flexShrink: 0,
                        alignSelf: 'center',
                      }}
                    >
                      {formatUsd(agent.costUsd)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </HudPanel>
          ) : null}

          <HudPanel>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box>
                <SectionLabel>Repositories</SectionLabel>
                <Typography variant="h6">Workspaces</Typography>
              </Box>
              <ControlTooltip title="View all workspaces">
                <Button component={RouterLink} to="/workspaces" size="small">
                  View all
                </Button>
              </ControlTooltip>
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
              <ControlTooltip title="Open the full pull request inbox">
                <Button component={RouterLink} to="/pull-requests" size="small">
                  Open inbox
                </Button>
              </ControlTooltip>
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
