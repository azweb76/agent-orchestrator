import { useEffect, useState } from 'react';
import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import type { InboxJiraIssue, WorkspaceWithCounts } from '@agent-orchestrator/shared';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';

type JiraWorkspacePickerDialogProps = {
  open: boolean;
  issue: InboxJiraIssue | null;
  workspaces: WorkspaceWithCounts[];
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (workspaceId: string) => void;
};

export function JiraWorkspacePickerDialog({
  open,
  issue,
  workspaces,
  loading,
  onCancel,
  onConfirm,
}: JiraWorkspacePickerDialogProps) {
  const [workspaceId, setWorkspaceId] = useState('');

  useEffect(() => {
    if (!open) return;
    const suggested = issue?.suggestedWorkspaceId ?? '';
    if (suggested && workspaces.some((ws) => ws.id === suggested)) {
      setWorkspaceId(suggested);
      return;
    }
    setWorkspaceId(workspaces[0]?.id ?? '');
  }, [open, issue, workspaces]);

  return (
    <ResponsiveDialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Choose workspace for {issue?.key ?? 'Jira issue'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No repo matched project {issue?.projectKey ?? '—'}. Pick a cloned workspace to start an
          agent. Your choice is remembered for this Jira project.
        </Typography>
        {workspaces.length === 0 ? (
          <Typography color="warning.main" variant="body2">
            Clone a workspace first, then start from this issue.
          </Typography>
        ) : (
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel id="jira-workspace-label">Workspace</InputLabel>
            <Select
              labelId="jira-workspace-label"
              label="Workspace"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(String(event.target.value))}
            >
              {workspaces.map((ws) => (
                <MenuItem key={ws.id} value={ws.id}>
                  {ws.name} ({ws.githubOwner}/{ws.githubRepo})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!workspaceId || loading || workspaces.length === 0}
          onClick={() => onConfirm(workspaceId)}
        >
          Start agent
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
