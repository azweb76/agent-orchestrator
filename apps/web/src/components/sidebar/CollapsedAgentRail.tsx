import { memo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Badge, Box, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import type { SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { AgentStatusDot, AgentStatusIcon, PrStatusDot } from './agentStatusVisuals';
import { DirtyWorktreeMark } from './SidebarAgentListItem';
import { SidebarAgentArchiveMenu } from './SidebarAgentArchiveMenu';
import { PullRequestStatusIcon } from '../pr/PullRequestStatusIcon';
import { formatSidebarGitCaption } from './sidebarGitStatus';
import {
  formatSidebarStatusCaption,
  resolveSidebarPrKind,
  sidebarAgentStatusLines,
} from './sidebarPrStatus';

const CollapsedAgentRailItem = memo(function CollapsedAgentRailItem({
  agent,
  workspace,
  selected,
  workspaceActive,
}: {
  agent: SidebarAgent;
  workspace: SidebarWorkspace;
  selected: boolean;
  workspaceActive: boolean;
}) {
  const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
  const stalled = Boolean(agent.stalled);
  const dirty = Boolean(agent.gitStatus?.dirty);
  const prKind = resolveSidebarPrKind(agent);
  const draftish =
    agent.deliveryPhase === 'pr_draft' ||
    agent.deliveryPhase === 'needs_pr' ||
    Boolean(agent.prStatus?.draft);

  return (
    <Box sx={{ position: 'relative' }}>
      <ControlTooltip
        sidebar
        title={
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {agent.name}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>
              {workspace.name}
            </Typography>
            {sidebarAgentStatusLines(agent).map((line) => (
              <Typography
                key={line}
                variant="caption"
                sx={{
                  display: 'block',
                  color:
                    line === 'Needs your input' ||
                    line === 'Stalled' ||
                    line.includes('dirty') ||
                    line === 'Draft PR' ||
                    line === 'Needs PR'
                      ? 'warning.main'
                      : undefined,
                }}
              >
                {line}
              </Typography>
            ))}
          </Box>
        }
      >
        <IconButton
          component={RouterLink}
          to={`/agents/${agent.id}`}
          size="small"
          aria-label={`${agent.name} (${formatSidebarStatusCaption(agent)}; ${formatSidebarGitCaption(agent)})`}
          sx={(theme) => ({
            width: 40,
            height: 40,
            borderRadius: 2,
            border: '1px solid',
            borderColor:
              selected || workspaceActive
                ? 'secondary.main'
                : dirty || draftish
                  ? 'warning.main'
                  : agent.status === 'running'
                    ? 'info.main'
                    : 'divider',
            bgcolor: selected
              ? theme.palette.ao.surface.selected
              : agent.status === 'running'
                ? theme.palette.ao.accent.infoTint
                : theme.palette.ao.surface.hover,
            position: 'relative',
            boxShadow:
              agent.status === 'running' ? `0 0 10px ${theme.palette.ao.accent.infoGlow}` : 'none',
            '&:hover': {
              bgcolor: theme.palette.ao.surface.hoverStrong,
            },
          })}
        >
          <Badge color="warning" variant="dot" overlap="circular" invisible={!needsInput && !stalled}>
            <AgentStatusIcon status={agent.status} selected={selected} />
          </Badge>
          <Box sx={{ position: 'absolute', right: 3, bottom: 3, display: 'flex', gap: 0.25 }}>
            {dirty ? <DirtyWorktreeMark size={10} /> : null}
            {prKind != null ? (
              <>
                <PullRequestStatusIcon status={prKind} sx={{ fontSize: 10 }} />
                {agent.prStatus ? <PrStatusDot status={agent.prStatus} size={5} /> : null}
              </>
            ) : !dirty ? (
              <AgentStatusDot status={agent.status} size={7} stalled={stalled} />
            ) : null}
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
});

export function CollapsedAgentRail({
  agents,
  selectedAgentId,
  selectedWorkspaceId,
  pathname,
}: {
  agents: Array<{ agent: SidebarAgent; workspace: SidebarWorkspace }>;
  selectedAgentId?: string;
  selectedWorkspaceId: string | null;
  pathname: string;
}) {
  if (agents.length === 0) {
    return (
      <Stack spacing={1} sx={{ alignItems: 'center', px: 1, pt: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ writingMode: 'vertical-rl' }}>
          No agents
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.75} sx={{ alignItems: 'center', px: 1, py: 1 }}>
      {agents.map(({ agent, workspace }) => (
        <CollapsedAgentRailItem
          key={agent.id}
          agent={agent}
          workspace={workspace}
          selected={selectedAgentId === agent.id}
          workspaceActive={selectedWorkspaceId === workspace.id && pathname.startsWith('/workspaces')}
        />
      ))}
    </Stack>
  );
}
