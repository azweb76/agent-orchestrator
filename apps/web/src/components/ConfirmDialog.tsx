import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { ControlTooltip } from './ui/ControlTooltip';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'error',
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <ControlTooltip title={cancelLabel} disabled={loading}>
          <Button onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
        </ControlTooltip>
        <ControlTooltip title={confirmLabel} disabled={loading}>
          <Button
            variant="contained"
            color={confirmColor}
            disabled={loading}
            onClick={onConfirm}
            autoFocus
          >
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </Dialog>
  );
}
