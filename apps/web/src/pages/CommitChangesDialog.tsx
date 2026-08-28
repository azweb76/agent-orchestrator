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
  Typography,
} from '@mui/material';
import type { UseMutationResult } from '@tanstack/react-query';
import type { CommitAgentChangesResponse } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { ResponsiveDialog } from '../components/ui/ResponsiveDialog';

interface CommitChangesDialogProps {
  open: boolean;
  message: string;
  push: boolean;
  /** When false, the worktree is clean and the action is push-only. */
  hasPendingChanges: boolean;
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
  hasPendingChanges,
  mutation,
  onClose,
  onCommitted,
  onMessageChange,
  onPushChange,
}: CommitChangesDialogProps) {
  const pushOnly = !hasPendingChanges;
  const effectivePush = pushOnly ? true : push;
  const canSubmit = pushOnly ? !mutation.isPending : Boolean(message.trim()) && !mutation.isPending;
  const submitLabel = mutation.isPending
    ? 'Working…'
    : pushOnly
      ? 'Push'
      : effectivePush
        ? 'Commit and push'
        : 'Commit';

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
      <DialogTitle>{pushOnly ? 'Push branch' : 'Commit changes'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {pushOnly ? (
            <Typography variant="body2" color="text.secondary">
              No local changes to commit. Push the current branch to origin.
            </Typography>
          ) : (
            <>
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
            </>
          )}
          {mutation.error ? (
            <Alert severity="error">{(mutation.error as Error).message}</Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <ControlTooltip
          title={pushOnly ? 'Close without pushing' : 'Close without committing'}
          disabled={mutation.isPending}
        >
          <Button onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
        </ControlTooltip>
        <ControlTooltip
          title={
            mutation.isPending
              ? pushOnly
                ? 'Pushing…'
                : 'Committing changes…'
              : pushOnly
                ? 'Push the current branch to origin'
                : !message.trim()
                  ? 'Enter a commit message first'
                  : effectivePush
                    ? 'Commit pending changes and push to origin'
                    : 'Commit pending changes locally'
          }
          disabled={!canSubmit}
        >
          <Button
            variant="contained"
            disabled={!canSubmit}
            onClick={() =>
              mutation.mutate(
                { message: message.trim(), push: effectivePush },
                { onSuccess: () => onCommitted?.() },
              )
            }
          >
            {submitLabel}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
