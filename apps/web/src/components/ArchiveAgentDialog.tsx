import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Typography,
} from '@mui/material';
import { ControlTooltip } from './ui/ControlTooltip';
import { ResponsiveDialog } from './ui/ResponsiveDialog';

export interface ArchiveAgentDialogProps {
  open: boolean;
  agentName?: string;
  worktreeName?: string;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (deleteWorktree: boolean) => void;
}

export function ArchiveAgentDialog({
  open,
  agentName,
  worktreeName,
  loading = false,
  error,
  onCancel,
  onConfirm,
}: ArchiveAgentDialogProps) {
  const [deleteWorktree, setDeleteWorktree] = useState(false);

  useEffect(() => {
    if (open) setDeleteWorktree(false);
  }, [open]);

  const title = agentName ? `Archive ${agentName}?` : 'Archive agent?';

  return (
    <ResponsiveDialog open={open} onClose={loading ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1.5 }}>
          This archives the agent so it no longer appears as active. You can still view its
          history.
        </DialogContentText>
        <ControlTooltip
          title="Remove the git worktree from disk and delete the agent and its chat history"
          disabled={loading}
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={deleteWorktree}
                onChange={(event) => setDeleteWorktree(event.target.checked)}
                disabled={loading}
              />
            }
            label={worktreeName ? `Also delete worktree “${worktreeName}”` : 'Also delete the worktree'}
          />
        </ControlTooltip>
        {deleteWorktree ? (
          <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4, mt: 0.25 }}>
            Removes the git worktree from disk. The agent and its chat history will be deleted.
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mt: 0.25 }}>
            Leave unchecked to keep the worktree and chat history.
          </Typography>
        )}
        {error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <ControlTooltip title="Cancel" disabled={loading}>
          <Button onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        </ControlTooltip>
        <ControlTooltip
          title={
            deleteWorktree
              ? 'Archive the agent and delete its worktree'
              : 'Archive the agent and keep the worktree'
          }
          disabled={loading}
        >
          <Button
            variant="contained"
            color="error"
            disabled={loading}
            onClick={() => onConfirm(deleteWorktree)}
          >
            {loading ? 'Working…' : deleteWorktree ? 'Archive and delete' : 'Archive'}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
