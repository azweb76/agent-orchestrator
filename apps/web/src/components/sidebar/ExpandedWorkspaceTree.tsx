import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import type { SidebarWorkspace } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { AgentStatusDot } from './agentStatusVisuals';
import { SidebarAgentListItem } from './SidebarAgentListItem';

export function ExpandedWorkspaceTree({
  tree,
  expandedWorkspaces,
  forceExpandAll,
  onToggleWorkspace,
  onCreateAgent,
  onClearFilters,
  selectedAgentId,
  selectedWorkspaceId,
  isLoading,
}: {
  tree: SidebarWorkspace[];
  expandedWorkspaces: Set<string>;
  /** Open every workspace regardless of persisted state (active search/filter). */
  forceExpandAll: boolean;
  onToggleWorkspace: (workspaceId: string) => void;
  onCreateAgent: (workspaceId: string) => void;
  /** Set when the tree is empty because of an active search/filter. */
  onClearFilters?: () => void;
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
    if (onClearFilters) {
      return (
        <Box sx={{ px: 2, py: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            No matching agents.
          </Typography>
          <ControlTooltip title="Clear search and status filters">
            <Button size="small" variant="outlined" onClick={onClearFilters}>
              Clear filters
            </Button>
          </ControlTooltip>
        </Box>
      );
    }
    return (
      <Box sx={{ px: 2, py: 2.5 }}>
        <Typography variant="body2" color="text.secondary">
          No workspaces yet.
        </Typography>
      </Box>
    );
  }

  return (
    <List dense disablePadding>
      {tree.map((workspace) => {
        const open = forceExpandAll || expandedWorkspaces.has(workspace.id);
        const workspaceSelected = selectedWorkspaceId === workspace.id && !selectedAgentId;
        const hasRunning = workspace.agents.some((agent) => agent.status === 'running');
        const dirtyCount = workspace.agents.filter((agent) => agent.gitStatus?.dirty).length;

        return (
          <Box key={workspace.id}>
            <ControlTooltip
              sidebar
              title={`${workspace.githubOwner}/${workspace.githubRepo} · ${workspace.agents.length} agent${workspace.agents.length === 1 ? '' : 's'}${dirtyCount > 0 ? ` · ${dirtyCount} dirty` : ''}`}
            >
              <ListItemButton
                component={RouterLink}
                to={`/workspaces/${workspace.id}`}
                selected={workspaceSelected}
                sx={{ py: 0.5, px: 1, alignItems: 'center' }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <FolderOpenOutlinedIcon
                    fontSize="small"
                    color={workspaceSelected ? 'secondary' : 'inherit'}
                  />
                </ListItemIcon>
                <ListItemText
                  sx={{ my: 0 }}
                  primary={
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {workspace.name}
                      </Typography>
                      {hasRunning && <AgentStatusDot status="running" size={6} />}
                      {dirtyCount > 0 ? (
                        <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                          {dirtyCount}M
                        </Typography>
                      ) : null}
                    </Stack>
                  }
                />
                <ControlTooltip title={`Create agent in ${workspace.name}`} sidebar>
                  <IconButton
                    size="small"
                    aria-label={`Create agent in ${workspace.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onCreateAgent(workspace.id);
                      if (!open) onToggleWorkspace(workspace.id);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    <AddIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </ControlTooltip>
                <ControlTooltip title={`${open ? 'Collapse' : 'Expand'} ${workspace.name}`} sidebar>
                  <IconButton
                    size="small"
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${workspace.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleWorkspace(workspace.id);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </ControlTooltip>
              </ListItemButton>
            </ControlTooltip>

            <Collapse in={open} timeout="auto" unmountOnExit>
              <List dense disablePadding>
                {workspace.agents.length === 0 ? (
                  <Box sx={{ pl: 4.5, py: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      No agents
                    </Typography>
                  </Box>
                ) : (
                  workspace.agents.map((agent) => (
                    <SidebarAgentListItem
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
