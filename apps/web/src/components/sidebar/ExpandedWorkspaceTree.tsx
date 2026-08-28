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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import type { SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';
import { AgentProgressBar, AgentStatusDot, AgentStatusIcon } from './agentStatusVisuals';

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
          <Button size="small" variant="outlined" onClick={onClearFilters}>
            Clear filters
          </Button>
        </Box>
      );
    }
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
        const open = forceExpandAll || expandedWorkspaces.has(workspace.id);
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
