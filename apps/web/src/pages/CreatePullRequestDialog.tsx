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
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { ResponsiveDialog } from '../components/ui/ResponsiveDialog';

interface CreatePullRequestDialogProps {
  open: boolean;
  title: string;
  body: string;
  draft: boolean;
  mutation: UseMutationResult<
    { number: number; htmlUrl: string },
    Error,
    { title: string; body: string; draft: boolean }
  >;
  onClose: () => void;
  onCreated?: () => void;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onDraftChange: (value: boolean) => void;
}

export function CreatePullRequestDialog({
  open,
  title,
  body,
  draft,
  mutation,
  onClose,
  onCreated,
  onTitleChange,
  onBodyChange,
  onDraftChange,
}: CreatePullRequestDialogProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create pull request</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <ControlTooltip title="Title shown on the GitHub pull request">
            <TextField
              label="Title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              fullWidth
              required
              autoFocus
            />
          </ControlTooltip>
          <ControlTooltip title="Optional description for the pull request body">
            <TextField
              label="Description"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              fullWidth
              multiline
              minRows={4}
            />
          </ControlTooltip>
          <ControlTooltip title="Keep the pull request as a draft on GitHub">
            <FormControlLabel
              control={
                <Checkbox checked={draft} onChange={(e) => onDraftChange(e.target.checked)} />
              }
              label="Open as draft"
            />
          </ControlTooltip>
          {mutation.error && (
            <Alert severity="error">{(mutation.error as Error).message}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <ControlTooltip title="Close without creating a pull request">
          <Button onClick={onClose}>Close</Button>
        </ControlTooltip>
        <ControlTooltip
          title={
            mutation.isPending
              ? 'Creating pull request on GitHub…'
              : !title
                ? 'Enter a title first'
                : 'Create pull request on GitHub'
          }
          disabled={!title || mutation.isPending}
        >
          <Button
            variant="contained"
            disabled={!title || mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { title, body, draft },
                { onSuccess: () => onCreated?.() },
              )
            }
          >
            {mutation.isPending ? 'Creating…' : 'Create PR'}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
