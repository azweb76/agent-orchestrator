import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import {
  Badge,
  Box,
  Collapse,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useQuery } from '@tanstack/react-query';
import type { AgentStatus, SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { CreateWorktreeDialog } from './CreateWorktreeDialog';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';

export const SIDEBAR_EXPANDED_WIDTH = 280;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

const COLLAPSE_STORAGE_KEY = 'ao.sidebar.collapsed';
const EXPANDED_WS_STORAGE_KEY = 'ao.sidebar.expandedWorkspaces';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadExpandedWorkspaces(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_WS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function statusDotColor(status: AgentStatus): string {
  switch (status) {
    case 'running':
      return 'info.main';
    case 'idle':
      return 'success.main';
    case 'stopped':
      return 'warning.main';
    case 'archived':
      return 'text.disabled';
    default:
      return 'text.secondary';
  }
}

function AgentProgressBar({ status }: { status: AgentStatus }) {
  if (status !== 'running') return null;
  return (
    <LinearProgress
      color="info"
      sx={{
        mt: 0.75,
        height: 3,
        borderRadius: 1,
        bgcolor: 'rgba(124,156,255,0.15)',
      }}
    />
  );
}

function AgentStatusDot({
  status,
  size = 8,
}: {
  status: AgentStatus;
  size?: number;
}) {
  const running = status === 'running';
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: statusDotColor(status),
        flexShrink: 0,
        boxShadow: running
          ? '0 0 6px 2px rgba(124,156,255,0.85), 0 0 0 3px rgba(124,156,255,0.3)'
          : 'none',
        animation: running ? 'ao-status-glow 1.2s ease-in-out infinite' : 'none',
        '@keyframes ao-status-glow': {
          '0%, 100%': {
            opacity: 1,
            transform: 'scale(1)',
            boxShadow: '0 0 6px 2px rgba(124,156,255,0.85), 0 0 0 3px rgba(124,156,255,0.3)',
          },
          '50%': {
            opacity: 0.75,
            transform: 'scale(0.9)',
            boxShadow: '0 0 12px 4px rgba(124,156,255,1), 0 0 0 4px rgba(124,156,255,0.45)',
          },
        },
      }}
    />
  );
}

function AgentStatusIcon({
  status,
  selected,
  fontSize = 'small',
}: {
  status: AgentStatus;
  selected?: boolean;
  fontSize?: 'small' | 'medium';
}) {
  const running = status === 'running';
  return (
    <SmartToyOutlinedIcon
      fontSize={fontSize}
      color={selected ? 'secondary' : running ? 'info' : 'inherit'}
      sx={{
        animation: running ? 'ao-agent-spin 2.4s linear infinite' : 'none',
        filter: running
          ? 'drop-shadow(0 0 4px rgba(124,156,255,0.9)) drop-shadow(0 0 8px rgba(124,156,255,0.45))'
          : 'none',
        '@keyframes ao-agent-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      }}
    />
  );
}

interface WorkspaceSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** When true, stretch to parent height (e.g. mobile drawer). */
  fillHeight?: boolean;
  /** Hide the expand/collapse control (mobile drawer). */
  hideCollapseControl?: boolean;
}

export function WorkspaceSidebar({
  collapsed,
  onCollapsedChange,
  fillHeight,
  hideCollapseControl,
}: WorkspaceSidebarProps) {
  const location = useLocation();
  const { workspaceId: routeWorkspaceId, agentId: routeAgentId } = useParams();
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(loadExpandedWorkspaces);
  const [createWorkspaceId, setCreateWorkspaceId] = useState<string | null>(null);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  const sidebarQuery = useQuery({
    queryKey: ['sidebar'],
    queryFn: api.listSidebar,
    // The SSE event stream invalidates this cache on changes; polling is a
    // slow fallback for missed events.
    refetchInterval: (query) => {
      const tree = query.state.data;
      if (!tree) return 15_000;
      const hasRunning = tree.some((ws) => ws.agents.some((a) => a.status === 'running'));
      return hasRunning ? 10_000 : 30_000;
    },
  });

  const tree = sidebarQuery.data ?? [];

  const selectedWorkspaceId = useMemo(() => {
    if (routeWorkspaceId) return routeWorkspaceId;
    if (!routeAgentId) return null;
    for (const workspace of tree) {
      if (workspace.agents.some((agent) => agent.id === routeAgentId)) {
        return workspace.id;
      }
    }
    return null;
  }, [routeWorkspaceId, routeAgentId, tree]);

  // Keep the workspace containing the active agent expanded.
  useEffect(() => {
    if (!selectedWorkspaceId) return;
    setExpandedWorkspaces((prev) => {
      if (prev.has(selectedWorkspaceId)) return prev;
      const next = new Set(prev);
      next.add(selectedWorkspaceId);
      try {
        localStorage.setItem(EXPANDED_WS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }, [selectedWorkspaceId]);

  const toggleWorkspace = (workspaceId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      try {
        localStorage.setItem(EXPANDED_WS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const setCollapsed = (next: boolean) => {
    onCollapsedChange(next);
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const allAgents = useMemo(
    () =>
      tree.flatMap((workspace) =>
        workspace.agents.map((agent) => ({ agent, workspace })),
      ),
    [tree],
  );

  const runningCount = allAgents.filter(({ agent }) => agent.status === 'running').length;

  return (
    <Box
      component="nav"
      aria-label="Workspaces and agents"
      sx={{
        width: '100%',
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'rgba(18,24,38,0.92)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        height: fillHeight ? '100%' : '100%',
        transition: (theme) =>
          theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.shorter,
          }),
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 1 : 1.5,
          py: 1.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 52,
        }}
      >
        {!collapsed && (
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Workspaces
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {runningCount > 0
                ? `${runningCount} agent${runningCount === 1 ? '' : 's'} running`
                : `${allAgents.length} agent${allAgents.length === 1 ? '' : 's'}`}
            </Typography>
          </Box>
        )}
        <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <Tooltip title="New workspace" placement="right">
            <IconButton
              size="small"
              onClick={() => setCreateWorkspaceOpen(true)}
              aria-label="New workspace"
              color="secondary"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {!hideCollapseControl ? (
            <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
              <IconButton
                size="small"
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          ) : null}
        </Stack>
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 0.5 }}>
        {collapsed ? (
          <CollapsedAgentRail
            agents={allAgents}
            selectedAgentId={routeAgentId}
            selectedWorkspaceId={selectedWorkspaceId}
            pathname={location.pathname}
            onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
          />
        ) : (
          <ExpandedWorkspaceTree
            tree={tree}
            expandedWorkspaces={expandedWorkspaces}
            onToggleWorkspace={toggleWorkspace}
            onCreateAgent={(workspaceId) => setCreateWorkspaceId(workspaceId)}
            onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
            selectedAgentId={routeAgentId}
            selectedWorkspaceId={selectedWorkspaceId}
            isLoading={sidebarQuery.isLoading}
          />
        )}
      </Box>

      {createWorkspaceId && (
        <CreateWorktreeDialog
          open
          onClose={() => setCreateWorkspaceId(null)}
          workspaceId={createWorkspaceId}
          defaultBranch={tree.find((ws) => ws.id === createWorkspaceId)?.defaultBranch}
        />
      )}

      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onClose={() => setCreateWorkspaceOpen(false)}
      />
    </Box>
  );
}

function CollapsedAgentRail({
  agents,
  selectedAgentId,
  selectedWorkspaceId,
  pathname,
  onCreateWorkspace,
}: {
  agents: Array<{ agent: SidebarAgent; workspace: SidebarWorkspace }>;
  selectedAgentId?: string;
  selectedWorkspaceId: string | null;
  pathname: string;
  onCreateWorkspace: () => void;
}) {
  if (agents.length === 0) {
    return (
      <Stack spacing={1} sx={{ alignItems: 'center', px: 1, pt: 2 }}>
        <Tooltip title="New workspace" placement="right">
          <IconButton
            size="small"
            onClick={onCreateWorkspace}
            aria-label="New workspace"
            color="secondary"
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" sx={{ writingMode: 'vertical-rl' }}>
          No agents
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.75} sx={{ alignItems: 'center', px: 1, py: 1 }}>
      <Tooltip title="New workspace" placement="right">
        <IconButton
          size="small"
          onClick={onCreateWorkspace}
          aria-label="New workspace"
          color="secondary"
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'rgba(94,234,212,0.06)',
          }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {agents.map(({ agent, workspace }) => {
        const selected = selectedAgentId === agent.id;
        const workspaceActive = selectedWorkspaceId === workspace.id && pathname.startsWith('/workspaces');
        const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
        return (
          <Tooltip
            key={agent.id}
            placement="right"
            title={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {agent.name}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block' }}>
                  {workspace.name} · {agent.status}
                </Typography>
                {needsInput && (
                  <Typography variant="caption" color="warning.light">
                    Needs your input
                  </Typography>
                )}
                {agent.status === 'running' && (
                  <Typography variant="caption" color="info.light">
                    In progress…
                  </Typography>
                )}
              </Box>
            }
          >
            <IconButton
              component={RouterLink}
              to={`/agents/${agent.id}`}
              size="small"
              aria-label={`${agent.name} (${agent.status})`}
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                border: '1px solid',
                borderColor:
                  selected || workspaceActive
                    ? 'secondary.main'
                    : agent.status === 'running'
                      ? 'info.main'
                      : 'divider',
                bgcolor:
                  selected
                    ? 'rgba(94,234,212,0.12)'
                    : agent.status === 'running'
                      ? 'rgba(124,156,255,0.1)'
                      : 'rgba(255,255,255,0.03)',
                position: 'relative',
                boxShadow:
                  agent.status === 'running'
                    ? '0 0 10px rgba(124,156,255,0.35)'
                    : 'none',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.08)',
                },
              }}
            >
              <Badge color="warning" variant="dot" overlap="circular" invisible={!needsInput}>
                <AgentStatusIcon status={agent.status} selected={selected} />
              </Badge>
              <Box sx={{ position: 'absolute', right: 4, bottom: 4 }}>
                <AgentStatusDot status={agent.status} size={7} />
              </Box>
              {agent.status === 'running' && (
                <LinearProgress
                  color="info"
                  sx={{
                    position: 'absolute',
                    left: 4,
                    right: 4,
                    bottom: 2,
                    height: 2,
                    borderRadius: 1,
                    bgcolor: 'transparent',
                  }}
                />
              )}
            </IconButton>
          </Tooltip>
        );
      })}
    </Stack>
  );
}

function ExpandedWorkspaceTree({
  tree,
  expandedWorkspaces,
  onToggleWorkspace,
  onCreateAgent,
  onCreateWorkspace,
  selectedAgentId,
  selectedWorkspaceId,
  isLoading,
}: {
  tree: SidebarWorkspace[];
  expandedWorkspaces: Set<string>;
  onToggleWorkspace: (workspaceId: string) => void;
  onCreateAgent: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  selectedAgentId?: string;
  selectedWorkspaceId: string | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Box sx={{ px: 2, py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      </Box>
    );
  }

  if (tree.length === 0) {
    return (
      <Box sx={{ px: 2, py: 2.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          No workspaces yet.
        </Typography>
        <ListItemButton
          onClick={onCreateWorkspace}
          sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', py: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <AddIcon fontSize="small" color="secondary" />
          </ListItemIcon>
          <ListItemText
            primary={
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Add a workspace
              </Typography>
            }
          />
        </ListItemButton>
      </Box>
    );
  }

  return (
    <List dense disablePadding>
      <ListItemButton
        onClick={onCreateWorkspace}
        sx={{ mx: 1, mb: 0.5, borderRadius: 1.5, py: 0.75 }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          <AddIcon fontSize="small" color="secondary" />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography variant="body2" color="secondary.main" sx={{ fontWeight: 600 }}>
              New workspace
            </Typography>
          }
        />
      </ListItemButton>

      {tree.map((workspace) => {
        const open = expandedWorkspaces.has(workspace.id);
        const workspaceSelected = selectedWorkspaceId === workspace.id && !selectedAgentId;
        const hasRunning = workspace.agents.some((agent) => agent.status === 'running');

        return (
          <Box key={workspace.id}>
            <ListItemButton
              selected={workspaceSelected}
              onClick={() => onToggleWorkspace(workspace.id)}
              sx={{ py: 1, px: 1.5, alignItems: 'flex-start' }}
            >
              <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
                <FolderOpenOutlinedIcon fontSize="small" color={workspaceSelected ? 'secondary' : 'inherit'} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {workspace.name}
                    </Typography>
                    {hasRunning && <AgentStatusDot status="running" size={6} />}
                  </Stack>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary" noWrap component="span">
                    {workspace.githubOwner}/{workspace.githubRepo}
                    {workspace.agents.length > 0
                      ? ` · ${workspace.agents.length} agent${workspace.agents.length === 1 ? '' : 's'}`
                      : ''}
                  </Typography>
                }
                slotProps={{
                  secondary: { component: 'div' },
                }}
              />
              <Tooltip title="New agent">
                <IconButton
                  size="small"
                  aria-label={`Create agent in ${workspace.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateAgent(workspace.id);
                    if (!open) onToggleWorkspace(workspace.id);
                  }}
                  sx={{ mr: 0.25, mt: 0.25 }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </ListItemButton>

            <Collapse in={open} timeout="auto" unmountOnExit>
              <List dense disablePadding>
                <ListItemButton
                  component={RouterLink}
                  to={`/workspaces/${workspace.id}`}
                  selected={workspaceSelected}
                  sx={{ pl: 5, py: 0.5 }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="caption" color="text.secondary">
                        Workspace overview
                      </Typography>
                    }
                  />
                </ListItemButton>

                <ListItemButton
                  onClick={() => onCreateAgent(workspace.id)}
                  sx={{ pl: 5, py: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <AddIcon fontSize="small" color="secondary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 600 }}>
                        New agent
                      </Typography>
                    }
                  />
                </ListItemButton>

                {workspace.agents.length === 0 ? (
                  <Box sx={{ pl: 5, pr: 2, py: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                      No agents yet
                    </Typography>
                  </Box>
                ) : (
                  workspace.agents.map((agent) => (
                    <AgentListItem
                      key={agent.id}
                      agent={agent}
                      selected={selectedAgentId === agent.id}
                    />
                  ))
                )}
              </List>
            </Collapse>
          </Box>
        );
      })}
    </List>
  );
}

function AgentListItem({ agent, selected }: { agent: SidebarAgent; selected: boolean }) {
  const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
  return (
    <ListItemButton
      component={RouterLink}
      to={`/agents/${agent.id}`}
      selected={selected}
      sx={{ pl: 5, py: 0.85, alignItems: 'flex-start' }}
    >
      <ListItemIcon sx={{ minWidth: 28, mt: 0.35 }}>
        <Badge color="warning" variant="dot" overlap="circular" invisible={!needsInput}>
          <AgentStatusIcon status={agent.status} selected={selected} />
        </Badge>
      </ListItemIcon>
      <ListItemText
        primary={
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: selected ? 700 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {agent.name}
            </Typography>
            <AgentStatusDot status={agent.status} />
          </Stack>
        }
        secondary={
          <Box component="span" sx={{ display: 'block' }}>
            <Typography variant="caption" color="text.secondary" noWrap component="span" sx={{ display: 'block' }}>
              {agent.worktree.branch}
              {agent.worktree.prNumber ? ` · PR #${agent.worktree.prNumber}` : ''}
              {' · '}
              {needsInput ? (
                <Box component="span" sx={{ color: 'warning.main', fontWeight: 700 }}>
                  Needs input
                </Box>
              ) : (
                <Box component="span" sx={{ textTransform: 'capitalize' }}>
                  {agent.status}
                </Box>
              )}
            </Typography>
            <AgentProgressBar status={agent.status} />
          </Box>
        }
        slotProps={{
          secondary: { component: 'div' },
        }}
      />
    </ListItemButton>
  );
}

export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  return [collapsed, setCollapsed];
}
