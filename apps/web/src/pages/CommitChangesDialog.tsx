import {
  Alert,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
} from '@mui/material';
import type { UseMutationResult } from '@tanstack/react-query';
import type { CommitAgentChangesResponse } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { ResponsiveDialog } from '../components/ui/ResponsiveDialog';

interface CommitChangesDialogProps {
  open: boolean;
  message: string;
  push: boolean;
  mutation: UseMutationResult<
    CommitAgentChangesResponse,
    Error,
    { message: string; push: boolean }
  >;
  onClose: () => void;
  onCommitted?: () => void;
  onMessageChange: (value: string) => void;
  onPushChange: (value: boolean) => void;
}

export function CommitChangesDialog({
  open,
  message,
  push,
  mutation,
  onClose,
  onCommitted,
  onMessageChange,
  onPushChange,
}: CommitChangesDialogProps) {
  return (
    <ResponsiveDialog
      open={open}
      onClose={() => {
        if (mutation.isPending) return;
        onClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Commit changes</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <ControlTooltip title="Message for the git commit">
            <TextField
              label="Commit message"
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              fullWidth
              required
              autoFocus
              multiline
              minRows={2}
            />
          </ControlTooltip>
          <ControlTooltip title="Push the commit to origin after committing locally">
            <FormControlLabel
              control={
                <Checkbox
                  checked={push}
                  onChange={(event) => onPushChange(event.target.checked)}
                />
              }
              label="Push to origin after committing"
            />
          </ControlTooltip>
          {mutation.error ? (
            <Alert severity="error">{(mutation.error as Error).message}</Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <ControlTooltip title="Close without committing" disabled={mutation.isPending}>
          <Button onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
        </ControlTooltip>
        <ControlTooltip
          title={
            mutation.isPending
              ? 'Committing changes…'
              : !message.trim()
                ? 'Enter a commit message first'
                : push
                  ? 'Commit pending changes and push to origin'
                  : 'Commit pending changes locally'
          }
          disabled={!message.trim() || mutation.isPending}
        >
          <Button
            variant="contained"
            disabled={!message.trim() || mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { message: message.trim(), push },
                { onSuccess: () => onCommitted?.() },
              )
            }
          >
            {mutation.isPending ? 'Working…' : push ? 'Commit and push' : 'Commit'}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
