import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { ControlTooltip } from '../ui/ControlTooltip';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';

export interface UndoFilesDialogProps {
  open: boolean;
  paths: string[];
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UndoFilesDialog({
  open,
  paths,
  loading = false,
  error,
  onCancel,
  onConfirm,
}: UndoFilesDialogProps) {
  const count = paths.length;
  const title = count === 1 ? 'Undo this file?' : `Undo ${count} files?`;

  return (
    <ResponsiveDialog open={open} onClose={loading ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1.5 }}>
          Restores the selected files to HEAD. Untracked files are deleted. This cannot be undone
          from the app.
        </DialogContentText>
        {paths.slice(0, 12).map((filePath) => (
          <DialogContentText
            key={filePath}
            sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12.5, mb: 0.25 }}
          >
            {filePath}
          </DialogContentText>
        ))}
        {paths.length > 12 ? (
          <DialogContentText variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            and {paths.length - 12} more
          </DialogContentText>
        ) : null}
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
        <ControlTooltip title="Restore selected files to HEAD" disabled={loading}>
          <Button variant="contained" color="warning" disabled={loading} onClick={onConfirm}>
            {loading ? 'Working…' : count === 1 ? 'Undo file' : `Undo ${count} files`}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
