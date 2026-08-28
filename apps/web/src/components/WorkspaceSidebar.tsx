import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Box, IconButton, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSseConnectionState } from '../api/events';
import {
  SSE_FALLBACK_ACTIVE_POLL_MS,
  SSE_FALLBACK_POLL_MS,
} from '../api/ssePolling';
import { CreateWorktreeDialog } from './CreateWorktreeDialog';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { ControlTooltip } from './ui/ControlTooltip';
import { CollapsedAgentRail } from './sidebar/CollapsedAgentRail';
import { ExpandedWorkspaceTree } from './sidebar/ExpandedWorkspaceTree';
import { SidebarFilterBar } from './sidebar/SidebarFilterBar';
import {
  filterSidebarTree,
  isSidebarFilterActive,
  type SidebarStatusFilter,
} from './sidebar/sidebarFilter';
import { resolveInitialSidebarCollapsed, SIDEBAR_DEFAULT_WIDTH } from './sidebar/sidebarPrefs';

export const SIDEBAR_EXPANDED_WIDTH = SIDEBAR_DEFAULT_WIDTH;
export const SIDEBAR_COLLAPSED_WIDTH = 72;
/** Mobile drawer overlays content, so it keeps a comfortable width. */
export const SIDEBAR_DRAWER_WIDTH = 280;

const COLLAPSE_STORAGE_KEY = 'ao.sidebar.collapsed';
const EXPANDED_WS_STORAGE_KEY = 'ao.sidebar.expandedWorkspaces';

function loadCollapsed(): boolean {
  try {
    return resolveInitialSidebarCollapsed(
      localStorage.getItem(COLLAPSE_STORAGE_KEY),
      window.innerWidth,
    );
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
  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatuses, setFilterStatuses] = useState<Set<SidebarStatusFilter>>(new Set());
  const sseState = useSseConnectionState();

  const sidebarQuery = useQuery({
    queryKey: ['sidebar'],
    queryFn: api.listSidebar,
    // SSE invalidates this cache; polling is only a fallback while the stream is down.
    refetchInterval: (query) => {
      if (sseState === 'connected') return false;
      const data = query.state.data;
      if (!data) return 15_000;
      const running = data.some((ws) => ws.agents.some((agent) => agent.status === 'running'));
      return running ? SSE_FALLBACK_ACTIVE_POLL_MS : SSE_FALLBACK_POLL_MS;
    },
  });

  const tree = sidebarQuery.data ?? [];
  const filterActive = isSidebarFilterActive(filterQuery, filterStatuses);
  const visibleTree = useMemo(
    () => filterSidebarTree(tree, filterQuery, filterStatuses),
    [tree, filterQuery, filterStatuses],
  );

  const clearFilters = () => {
    setFilterQuery('');
    setFilterStatuses(new Set());
  };

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

  const runningCount = useMemo(
    () => allAgents.filter(({ agent }) => agent.status === 'running').length,
    [allAgents],
  );

  return (
    <Box
      component="nav"
      aria-label="Workspaces and agents"
      sx={{
        width: '100%',
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'ao.surface.sidebar',
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
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 40,
        }}
      >
        {!collapsed && (
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ minWidth: 0, flex: 1, alignItems: 'baseline' }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Workspaces
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {runningCount > 0 ? `${runningCount} running` : ''}
            </Typography>
          </Stack>
        )}
        <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <ControlTooltip title="New workspace" sidebar>
            <IconButton
              size="small"
              onClick={() => setCreateWorkspaceOpen(true)}
              aria-label="New workspace"
              color="secondary"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
          {!hideCollapseControl ? (
            <ControlTooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} sidebar>
              <IconButton
                size="small"
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
              </IconButton>
            </ControlTooltip>
          ) : null}
        </Stack>
      </Stack>

      {!collapsed && (
        <SidebarFilterBar
          query={filterQuery}
          onQueryChange={setFilterQuery}
          statuses={filterStatuses}
          onStatusesChange={setFilterStatuses}
        />
      )}

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
            tree={visibleTree}
            expandedWorkspaces={expandedWorkspaces}
            forceExpandAll={filterActive}
            onToggleWorkspace={toggleWorkspace}
            onCreateAgent={(workspaceId) => setCreateWorkspaceId(workspaceId)}
            onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
            onClearFilters={filterActive ? clearFilters : undefined}
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

export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  return [collapsed, setCollapsed];
}
