import { memo } from 'react';
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
import { SidebarAgentArchiveMenu } from './SidebarAgentArchiveMenu';
import { PullRequestStatusIcon } from '../pr/PullRequestStatusIcon';

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

        return (
          <Box key={workspace.id}>
            <ControlTooltip
              sidebar
              title={`${workspace.githubOwner}/${workspace.githubRepo} · ${workspace.agents.length} agent${workspace.agents.length === 1 ? '' : 's'}`}
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

function prStatusWord(status: SidebarAgent['prStatus']): string {
  if (!status) return '';
  if (status.merged) return 'Merged';
  if (status.state === 'closed') return 'Closed';
  if (status.checksRollup === 'failure') return 'Checks failing';
  if (status.checksRollup === 'pending') return 'Checks pending';
  if (status.draft) return 'Draft';
  return 'Open';
}

const AgentListItem = memo(function AgentListItem({
  agent,
  selected,
}: {
  agent: SidebarAgent;
  selected: boolean;
}) {
  const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
  const stalled = Boolean(agent.stalled);
  const statusHint = needsInput ? 'Needs your input' : stalled ? 'Stalled' : agent.status;
  return (
    <ControlTooltip
      sidebar
      title={
        <Box>
          <Typography variant="caption" sx={{ display: 'block' }}>
            {agent.worktree.branch}
            {agent.worktree.prNumber
              ? ` · PR #${agent.worktree.prNumber}${agent.prStatus ? ` · ${prStatusWord(agent.prStatus)}` : ''}`
              : ''}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: 'block', textTransform: 'capitalize' }}
            color={needsInput || stalled ? 'warning.main' : undefined}
          >
            {statusHint}
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
          <Badge color="warning" variant="dot" overlap="circular" invisible={!needsInput && !stalled}>
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
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {agent.name}
              </Typography>
              {agent.worktree.prNumber != null ? (
                <PullRequestStatusIcon
                  status={
                    agent.prStatus?.merged
                      ? 'merged'
                      : agent.prStatus?.state === 'closed'
                        ? 'closed'
                        : agent.prStatus?.draft
                          ? 'draft'
                          : 'open'
                  }
                  sx={{ fontSize: 14, flexShrink: 0 }}
                />
              ) : (
                <AgentStatusDot status={agent.status} size={7} stalled={stalled} />
              )}
            </Stack>
          }
        />
        <SidebarAgentArchiveMenu agent={agent} />
      </ListItemButton>
    </ControlTooltip>
  );
});
