import { useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StopIcon from '@mui/icons-material/Stop';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import type { AgentDetail } from '@agent-orchestrator/shared';
import { AgentDeliveryPhaseChip } from '../components/agent/AgentDeliveryPhaseChip';
import { AgentPrStatusStrip } from '../components/agent/AgentPrStatusStrip';
import { AgentShipActions } from '../components/agent/AgentShipActions';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageBreadcrumbs } from '../components/ui/PageBreadcrumbs';
import { statusColor } from '../theme';
import { statusLabel } from '../utils/format';

interface AgentPageHeaderProps {
  agent: AgentDetail;
  archived: boolean;
  archivePending: boolean;
  unarchivePending: boolean;
  stopPending: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onStop: () => void;
  onCommit: (opts: { push: boolean; hasPendingChanges: boolean }) => void;
  onCreateDraftPr: () => void;
}

/** Runtime status is redundant with delivery phase when idle — only surface active states. */
function showRuntimeStatus(status: AgentDetail['status']): boolean {
  return status === 'running' || status === 'queued' || status === 'stopped';
}

function agentIsLive(agent: AgentDetail): boolean {
  if (agent.status === 'running' || agent.pid != null) return true;
  return agent.sessions.some((session) => session.status === 'running' || session.pid != null);
}

export function AgentPageHeader({
  agent,
  archived,
  archivePending,
  unarchivePending,
  stopPending,
  onArchive,
  onUnarchive,
  onStop,
  onCommit,
  onCreateDraftPr,
}: AgentPageHeaderProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const busy = archivePending || unarchivePending || stopPending;
  const hasPr = agent.worktree.prNumber != null && agent.worktree.prNumber > 0;
  const live = !archived && agentIsLive(agent);

  return (
    <Stack spacing={0.75} sx={{ flexShrink: 0 }}>
      <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
        <PageBreadcrumbs
          items={[
            { label: 'Workspaces', to: '/workspaces' },
            { label: agent.workspace.name, to: `/workspaces/${agent.workspace.id}` },
            { label: agent.name },
          ]}
        />
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: { xs: '1.15rem', md: '1.35rem' } }}
            >
              {agent.name}
            </Typography>
            {showRuntimeStatus(agent.status) ? (
              <Chip
                size="small"
                label={statusLabel(agent.status)}
                color={statusColor(agent.status)}
                variant="outlined"
              />
            ) : null}
            {/* PR status strip owns delivery once a PR is linked */}
            {!hasPr || archived ? (
              <AgentDeliveryPhaseChip agent={agent} archived={archived} />
            ) : null}
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: 'block', mt: 0.35, fontFamily: 'IBM Plex Mono, monospace' }}
          >
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
              {agent.workspace.githubOwner}/{agent.workspace.githubRepo}
              {' · '}
            </Box>
            {agent.worktree.branch}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <AgentShipActions
            agent={agent}
            archived={archived}
            onCommit={onCommit}
            onCreateDraftPr={onCreateDraftPr}
          />

          <ControlTooltip title="Agent actions" disabled={busy}>
            <IconButton
              size="small"
              aria-label="Agent actions"
              disabled={busy}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
        </Stack>
      </Stack>

      {hasPr ? <AgentPrStatusStrip agent={agent} /> : null}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {live ? (
          <MenuItem
            disabled={stopPending}
            onClick={() => {
              setMenuAnchor(null);
              onStop();
            }}
          >
            <ListItemIcon>
              <StopIcon fontSize="small" />
            </ListItemIcon>
            Stop agent
          </MenuItem>
        ) : null}
        {archived ? (
          <MenuItem
            disabled={unarchivePending}
            onClick={() => {
              setMenuAnchor(null);
              onUnarchive();
            }}
          >
            <ListItemIcon>
              <UnarchiveOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Unarchive
          </MenuItem>
        ) : (
          <MenuItem
            disabled={archivePending}
            onClick={() => {
              setMenuAnchor(null);
              onArchive();
            }}
          >
            <ListItemIcon>
              <ArchiveOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Archive
          </MenuItem>
        )}
      </Menu>
    </Stack>
  );
}
