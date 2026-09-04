import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconButton, ListItemIcon, Menu, MenuItem } from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StopIcon from '@mui/icons-material/Stop';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import type { SidebarAgent } from '@agent-orchestrator/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ArchiveAgentDialog } from '../ArchiveAgentDialog';
import { ControlTooltip } from '../ui/ControlTooltip';

export function SidebarAgentArchiveMenu({ agent }: { agent: SidebarAgent }) {
  const { agentId: routeAgentId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pendingArchiveOpen, setPendingArchiveOpen] = useState(false);
  const archived = agent.status === 'archived';
  const live = agent.status === 'running';

  const archiveMutation = useMutation({
    mutationFn: (deleteWorktree: boolean) => api.archiveAgent(agent.id, { deleteWorktree }),
    onSuccess: (result) => {
      setArchiveOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
      if (routeAgentId === agent.id) {
        navigate(result.deletedWorktree ? '/' : `/agents/${agent.id}`);
      }
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopAgent(agent.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      void queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      void queryClient.invalidateQueries({ queryKey: ['claude-processes'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => api.unarchiveAgent(agent.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      void queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const busy = archiveMutation.isPending || unarchiveMutation.isPending || stopMutation.isPending;

  return (
    <>
      <ControlTooltip title="Agent actions" sidebar disabled={busy}>
        <IconButton
          size="small"
          aria-label={`Actions for ${agent.name}`}
          disabled={busy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuAnchor(event.currentTarget);
          }}
          sx={{ p: 0.25, opacity: 0.75, '&:hover': { opacity: 1 } }}
        >
          <MoreVertIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </ControlTooltip>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        onClick={(event) => event.stopPropagation()}
        slotProps={{
          transition: {
            onExited: () => {
              if (pendingArchiveOpen) {
                setPendingArchiveOpen(false);
                setArchiveOpen(true);
              }
            },
          },
        }}
      >
        {live ? (
          <MenuItem
            disabled={stopMutation.isPending}
            onClick={() => {
              setMenuAnchor(null);
              stopMutation.mutate();
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
            disabled={unarchiveMutation.isPending}
            onClick={() => {
              setMenuAnchor(null);
              unarchiveMutation.mutate();
            }}
          >
            <ListItemIcon>
              <UnarchiveOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Unarchive
          </MenuItem>
        ) : (
          <MenuItem
            disabled={archiveMutation.isPending}
            onClick={() => {
              setMenuAnchor(null);
              archiveMutation.reset();
              setPendingArchiveOpen(true);
            }}
          >
            <ListItemIcon>
              <ArchiveOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Archive
          </MenuItem>
        )}
      </Menu>

      <ArchiveAgentDialog
        open={archiveOpen}
        agentName={agent.name}
        worktreeName={agent.worktree.name}
        loading={archiveMutation.isPending}
        error={archiveMutation.error ? (archiveMutation.error as Error).message : null}
        onCancel={() => {
          if (!archiveMutation.isPending) setArchiveOpen(false);
        }}
        onConfirm={(deleteWorktree) => archiveMutation.mutate(deleteWorktree)}
      />
    </>
  );
}
