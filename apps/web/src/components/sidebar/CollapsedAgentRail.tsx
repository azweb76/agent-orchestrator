import { Link as RouterLink } from 'react-router-dom';
import { Badge, Box, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { AgentStatusDot, AgentStatusIcon } from './agentStatusVisuals';
import { SidebarAgentArchiveMenu } from './SidebarAgentArchiveMenu';

export function CollapsedAgentRail({
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
        <ControlTooltip title="New workspace" sidebar>
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
        </ControlTooltip>
        <Typography variant="caption" color="text.secondary" sx={{ writingMode: 'vertical-rl' }}>
          No agents
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.75} sx={{ alignItems: 'center', px: 1, py: 1 }}>
      <ControlTooltip title="New workspace" sidebar>
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
            bgcolor: 'ao.accent.secondaryTint',
          }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </ControlTooltip>
      {agents.map(({ agent, workspace }) => {
        const selected = selectedAgentId === agent.id;
        const workspaceActive = selectedWorkspaceId === workspace.id && pathname.startsWith('/workspaces');
        const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
        return (
          <Box key={agent.id} sx={{ position: 'relative' }}>
            <ControlTooltip
              sidebar
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
                sx={(theme) => ({
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
                      ? theme.palette.ao.surface.selected
                      : agent.status === 'running'
                        ? theme.palette.ao.accent.infoTint
                        : theme.palette.ao.surface.hover,
                  position: 'relative',
                  boxShadow:
                    agent.status === 'running'
                      ? `0 0 10px ${theme.palette.ao.accent.infoGlow}`
                      : 'none',
                  '&:hover': {
                    bgcolor: theme.palette.ao.surface.hoverStrong,
                  },
                })}
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
            </ControlTooltip>
            <Box
              sx={{
                position: 'absolute',
                top: -2,
                right: -2,
                bgcolor: 'ao.surface.sidebar',
                borderRadius: 1,
              }}
            >
              <SidebarAgentArchiveMenu agent={agent} />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
