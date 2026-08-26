import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Rating,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { SESSION_GRADE_LABELS, type SessionGrade, type SessionGradeScore } from '@agent-orchestrator/shared';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';

interface GradeSessionDialogProps {
  open: boolean;
  sessionTitle: string;
  current?: SessionGrade | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (score: SessionGradeScore, comment: string) => void;
}

export function GradeSessionDialog({
  open,
  sessionTitle,
  current,
  loading,
  error,
  onClose,
  onSave,
}: GradeSessionDialogProps) {
  const [score, setScore] = useState<number>(current?.score ?? 0);
  const [comment, setComment] = useState(current?.comment ?? '');

  useEffect(() => {
    if (!open) return;
    setScore(current?.score ?? 0);
    setComment(current?.comment ?? '');
  }, [open, current?.score, current?.comment]);

  const canSave = score >= 1 && score <= 5 && !loading;

  return (
    <ResponsiveDialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Grade this session</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            How did <strong>{sessionTitle}</strong> go? The score is saved with this chat so you can
            later turn the transcript into a skill or instruction file.
          </Typography>
          <Stack spacing={0.75} sx={{ alignItems: 'flex-start' }}>
            <Rating
              name="session-grade"
              value={score}
              onChange={(_, value) => setScore(value ?? 0)}
              size="large"
            />
            <Typography variant="caption" color="text.secondary">
              {score >= 1 && score <= 5
                ? SESSION_GRADE_LABELS[score as SessionGradeScore]
                : 'Select 1–5 stars'}
            </Typography>
          </Stack>
          <TextField
            label="What went well or poorly?"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            fullWidth
            multiline
            minRows={3}
            placeholder="Optional notes the next draft can learn from"
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!canSave}
          onClick={() => onSave(score as SessionGradeScore, comment)}
        >
          {loading ? 'Saving…' : current ? 'Update grade' : 'Save grade'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
