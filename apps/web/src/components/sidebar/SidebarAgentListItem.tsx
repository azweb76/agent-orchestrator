import { memo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Badge,
  Box,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import type { SidebarAgent } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { AgentStatusDot, AgentStatusIcon, PrStatusDot } from './agentStatusVisuals';
import { SidebarAgentArchiveMenu } from './SidebarAgentArchiveMenu';
import { PullRequestStatusIcon } from '../pr/PullRequestStatusIcon';
import {
  formatSidebarStatusCaption,
  resolveSidebarPrKind,
  sidebarAgentStatusLines,
} from './sidebarPrStatus';

/** Tiny "M" mark for a dirty worktree (modified), VS Code–style. */
export function DirtyWorktreeMark({ size = 12 }: { size?: number }) {
  return (
    <Box
      component="span"
      aria-label="Uncommitted changes"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 0.5,
        bgcolor: 'warning.main',
        color: 'warning.contrastText',
        fontSize: Math.max(8, size - 3),
        fontWeight: 800,
        lineHeight: 1,
        flexShrink: 0,
        fontFamily: 'IBM Plex Mono, monospace',
      }}
    >
      M
    </Box>
  );
}

export const SidebarAgentListItem = memo(function SidebarAgentListItem({
  agent,
  selected,
}: {
  agent: SidebarAgent;
  selected: boolean;
}) {
  const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
  const stalled = Boolean(agent.stalled);
  const dirty = Boolean(agent.gitStatus?.dirty);
  const statusCaption = formatSidebarStatusCaption(agent);
  const prKind = resolveSidebarPrKind(agent);

  return (
    <ControlTooltip
      sidebar
      title={
        <Box>
          {sidebarAgentStatusLines(agent).map((line) => (
            <Typography
              key={line}
              variant="caption"
              sx={{
                display: 'block',
                textTransform:
                  line === agent.status || line.startsWith('Needs') || line === 'Stalled'
                    ? 'capitalize'
                    : undefined,
                color:
                  line === 'Needs your input' ||
                  line === 'Stalled' ||
                  line.includes('dirty') ||
                  line === 'Draft PR' ||
                  line === 'Needs PR' ||
                  line === 'CI failing'
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
      <ListItemButton
        component={RouterLink}
        to={`/agents/${agent.id}`}
        selected={selected}
        sx={{ pl: 4.5, pr: 1.5, py: 0.35, alignItems: 'center' }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <Badge color="warning" variant="dot" overlap="circular" invisible={!needsInput && !stalled}>
            <AgentStatusIcon status={agent.status} selected={selected} />
          </Badge>
        </ListItemIcon>
        <ListItemText
          sx={{ my: 0, minWidth: 0 }}
          primary={
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
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
              {dirty ? <DirtyWorktreeMark /> : null}
              {prKind != null ? (
                <Stack direction="row" spacing={0.35} sx={{ alignItems: 'center', flexShrink: 0 }}>
                  <PullRequestStatusIcon status={prKind} sx={{ fontSize: 14 }} />
                  {agent.prStatus ? <PrStatusDot status={agent.prStatus} size={6} /> : null}
                </Stack>
              ) : (
                <AgentStatusDot status={agent.status} size={7} stalled={stalled} />
              )}
            </Stack>
          }
          secondary={
            <Typography
              variant="caption"
              color={
                dirty ||
                agent.deliveryPhase === 'pr_draft' ||
                agent.deliveryPhase === 'needs_pr' ||
                agent.deliveryPhase === 'checks_failing' ||
                agent.deliveryPhase === 'has_conflicts'
                  ? 'warning.main'
                  : 'text.secondary'
              }
              noWrap
              sx={{ display: 'block', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}
            >
              {statusCaption}
            </Typography>
          }
        />
        <SidebarAgentArchiveMenu agent={agent} />
      </ListItemButton>
    </ControlTooltip>
  );
});
