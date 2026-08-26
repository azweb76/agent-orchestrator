import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Rating,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  SESSION_GRADE_FINDING_CATEGORIES,
  SESSION_GRADE_FINDING_LABELS,
  SESSION_GRADE_LABELS,
  type SessionGrade,
  type SessionGradeFinding,
  type SessionGradeFindingSeverity,
} from '@agent-orchestrator/shared';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';

interface GradeSessionDialogProps {
  open: boolean;
  sessionTitle: string;
  current?: SessionGrade | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onAnalyze: (notes: string) => void;
}

function severityColor(severity: SessionGradeFindingSeverity): 'success' | 'warning' | 'error' {
  if (severity === 'ok') return 'success';
  if (severity === 'issue') return 'error';
  return 'warning';
}

function FindingCard({ finding }: { finding: SessionGradeFinding }) {
  return (
    <Stack
      spacing={0.5}
      sx={{
        p: 1.25,
        borderRadius: 1.5,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'rgba(255,255,255,0.02)',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">{SESSION_GRADE_FINDING_LABELS[finding.category]}</Typography>
        <Chip
          size="small"
          color={severityColor(finding.severity)}
          label={finding.severity === 'ok' ? 'OK' : finding.severity === 'issue' ? 'Issue' : 'Warning'}
          sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: 11, fontWeight: 600 } }}
        />
      </Stack>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {finding.title}
      </Typography>
      {finding.detail ? (
        <Typography variant="body2" color="text.secondary">
          {finding.detail}
        </Typography>
      ) : null}
    </Stack>
  );
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

export function GradeSessionDialog({
  open,
  sessionTitle,
  current,
  loading,
  error,
  onClose,
  onAnalyze,
}: GradeSessionDialogProps) {
  const [notes, setNotes] = useState('');
  const analysis = current?.analysis;

  useEffect(() => {
    if (!open) setNotes('');
  }, [open]);

  return (
    <ResponsiveDialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Grade this session</DialogTitle>
      {loading ? <LinearProgress sx={{ mt: -1 }} /> : null}
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            AI analyzes <strong>{sessionTitle}</strong> for excessive turns, wasted tokens, bloated
            context, instruction-file problems, and missing or weak skills.
          </Typography>

          {loading && !analysis ? (
            <Stack spacing={1.25} sx={{ alignItems: 'center', py: 3 }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Reading the transcript, instruction files, and skills…
              </Typography>
            </Stack>
          ) : null}

          {current ? (
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Rating name="session-grade" value={current.score} readOnly size="large" />
                <Typography variant="body2" color="text.secondary">
                  {current.score}/5 · {SESSION_GRADE_LABELS[current.score]}
                </Typography>
              </Stack>
              {analysis?.stats ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  <Chip
                    size="small"
                    label={`${analysis.stats.userTurns} user / ${analysis.stats.assistantTurns} assistant ${
                      analysis.stats.userTurns + analysis.stats.assistantTurns === 1 ? 'turn' : 'turns'
                    }`}
                  />
                  <Chip size="small" label={`~${formatTokens(analysis.stats.estimatedTokens)} tokens`} />
                  {analysis.stats.costUsd != null ? (
                    <Chip size="small" label={`$${analysis.stats.costUsd.toFixed(2)}`} />
                  ) : null}
                  <Chip size="small" label={plural(analysis.stats.toolCalls, 'tool')} />
                  <Chip
                    size="small"
                    label={plural(analysis.stats.instructionFileCount, 'instruction file')}
                  />
                  <Chip size="small" label={plural(analysis.stats.skillCount, 'skill')} />
                </Box>
              ) : null}
              <Typography variant="body2">{analysis?.summary || current.comment}</Typography>
              {analysis ? (
                <Stack spacing={1}>
                  {SESSION_GRADE_FINDING_CATEGORIES.map((category) => {
                    const finding = analysis.findings.find((item) => item.category === category);
                    return finding ? <FindingCard key={category} finding={finding} /> : null;
                  })}
                </Stack>
              ) : null}
            </Stack>
          ) : null}

          <TextField
            label="Notes for the next analysis"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            disabled={loading}
            placeholder="Optional: what to emphasize, e.g. token waste or missing skills"
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Close
        </Button>
        <Button variant="contained" disabled={loading} onClick={() => onAnalyze(notes)}>
          {loading ? 'Analyzing…' : current ? 'Analyze again' : 'Analyze session'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
