import { Link as RouterLink } from 'react-router-dom';
import {
  Badge,
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
import type { SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { AgentStatusDot, AgentStatusIcon } from './agentStatusVisuals';

export function ExpandedWorkspaceTree({
  tree,
  expandedWorkspaces,
  forceExpandAll,
  onToggleWorkspace,
  onCreateAgent,
  onCreateWorkspace,
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
  onCreateWorkspace: () => void;
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          No workspaces yet.
        </Typography>
        <ControlTooltip title="Create a new workspace" sidebar>
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
        </ControlTooltip>
      </Box>
    );
  }

  return (
    <List dense disablePadding>
      {tree.map((workspace) => {
        const open = forceExpandAll || expandedWorkspaces.has(workspace.id);
        const workspaceSelected = selectedWorkspaceId === workspace.id && !selectedAgentId;
        const hasRunning = workspace.agents.some((agent) => agent.status === 'running');

        return (
          <Box key={workspace.id}>
            <ControlTooltip
              sidebar
              title={`${workspace.githubOwner}/${workspace.githubRepo} · ${workspace.agents.length} agent${workspace.agents.length === 1 ? '' : 's'}`}
            >
              <ListItemButton
                selected={workspaceSelected}
                onClick={() => onToggleWorkspace(workspace.id)}
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
                    </Stack>
                  }
                />
                <ControlTooltip title={`Create agent in ${workspace.name}`} sidebar>
                  <IconButton
                    size="small"
                    aria-label={`Create agent in ${workspace.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateAgent(workspace.id);
                      if (!open) onToggleWorkspace(workspace.id);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    <AddIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </ControlTooltip>
                {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </ListItemButton>
            </ControlTooltip>

            <Collapse in={open} timeout="auto" unmountOnExit>
              <List dense disablePadding>
                <ControlTooltip title="Open workspace overview" sidebar>
                  <ListItemButton
                    component={RouterLink}
                    to={`/workspaces/${workspace.id}`}
                    selected={workspaceSelected}
                    sx={{ pl: 4.5, py: 0.25 }}
                  >
                    <ListItemText
                      sx={{ my: 0 }}
                      primary={
                        <Typography variant="caption" color="text.secondary">
                          Workspace overview
                        </Typography>
                      }
                    />
                  </ListItemButton>
                </ControlTooltip>

                {workspace.agents.length === 0 ? (
                  <ControlTooltip title="Create a new agent in this workspace" sidebar>
                    <ListItemButton onClick={() => onCreateAgent(workspace.id)} sx={{ pl: 4.5, py: 0.25 }}>
                      <ListItemText
                        sx={{ my: 0 }}
                        primary={
                          <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 600 }}>
                            New agent
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  </ControlTooltip>
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
    <ControlTooltip
      sidebar
      title={
        <Box>
          <Typography variant="caption" sx={{ display: 'block' }}>
            {agent.worktree.branch}
            {agent.worktree.prNumber ? ` · PR #${agent.worktree.prNumber}` : ''}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: 'block', textTransform: 'capitalize' }}
            color={needsInput ? 'warning.light' : undefined}
          >
            {needsInput ? 'Needs your input' : agent.status}
          </Typography>
        </Box>
      }
    >
      <ListItemButton
        component={RouterLink}
        to={`/agents/${agent.id}`}
        selected={selected}
        sx={{ pl: 4.5, pr: 1.5, py: 0.4, alignItems: 'center' }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <Badge color="warning" variant="dot" overlap="circular" invisible={!needsInput}>
            <AgentStatusIcon status={agent.status} selected={selected} />
          </Badge>
        </ListItemIcon>
        <ListItemText
          sx={{ my: 0 }}
          primary={
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontWeight: selected ? 700 : 500,
                  color: needsInput ? 'warning.main' : undefined,
                }}
              >
                {agent.name}
              </Typography>
              <AgentStatusDot status={agent.status} size={7} />
            </Stack>
          }
        />
      </ListItemButton>
    </ControlTooltip>
  );
}
