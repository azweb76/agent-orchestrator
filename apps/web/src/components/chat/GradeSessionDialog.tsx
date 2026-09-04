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
  IconButton,
  LinearProgress,
  Rating,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  SESSION_GRADE_FINDING_CATEGORIES,
  SESSION_GRADE_FINDING_LABELS,
  SESSION_GRADE_LABELS,
  type SessionGrade,
  type SessionGradeFinding,
  type SessionGradeFindingSeverity,
} from '@agent-orchestrator/shared';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';
import { ControlTooltip } from '../ui/ControlTooltip';

interface GradeSessionDialogProps {
  open: boolean;
  sessionTitle: string;
  /** Absolute path of the session file being graded, when known. */
  sessionFilePath?: string | null;
  current?: SessionGrade | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onAnalyze: (notes: string) => void;
  /** Create a new chat session to implement a single finding's suggestion. */
  onImplementFinding?: (finding: SessionGradeFinding) => void;
}

/** Kickoff prompt for a new chat that implements one graded finding. */
export function buildFindingImplementPrompt(finding: SessionGradeFinding): string {
  const category = SESSION_GRADE_FINDING_LABELS[finding.category];
  const suggestion = finding.suggestion?.trim() || finding.detail.trim();
  return [
    '## Problem',
    `${category} — ${finding.title}`,
    finding.detail.trim(),
    '',
    '## Suggestion',
    suggestion,
    '',
    'Implement this improvement in the worktree. Prefer writing or updating the',
    'appropriate skill / CLAUDE.md / AGENTS.md if the suggestion calls for it.',
  ].join('\n');
}

function severityColor(severity: SessionGradeFindingSeverity): 'success' | 'warning' | 'error' {
  if (severity === 'ok') return 'success';
  if (severity === 'issue') return 'error';
  return 'warning';
}

function FindingCard({
  finding,
  onImplement,
}: {
  finding: SessionGradeFinding;
  onImplement?: (finding: SessionGradeFinding) => void;
}) {
  const suggestion = finding.suggestion?.trim() || (finding.severity !== 'ok' ? finding.detail.trim() : '');

  return (
    <Stack
      spacing={0.5}
      sx={{
        p: 1.25,
        borderRadius: 1.5,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'ao.surface.inset',
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
      {finding.severity !== 'ok' && suggestion ? (
        <Box sx={{ pt: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
            Suggestion
          </Typography>
          <Typography variant="body2">{suggestion}</Typography>
        </Box>
      ) : null}
      {finding.severity !== 'ok' && onImplement ? (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.25 }}>
          <ControlTooltip title="Start a new chat to implement this suggestion">
            <Button size="small" variant="outlined" onClick={() => onImplement(finding)}>
              Start chat
            </Button>
          </ControlTooltip>
        </Box>
      ) : null}
    </Stack>
  );
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatTokens(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

function SessionFilePath({ filePath }: { filePath: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Session file
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12,
            wordBreak: 'break-all',
            minWidth: 0,
            flex: 1,
            pt: 0.35,
          }}
        >
          {filePath}
        </Typography>
        <ControlTooltip title={copied ? 'Copied' : 'Copy path'}>
          <IconButton
            size="small"
            aria-label="Copy session file path"
            onClick={() => {
              void navigator.clipboard.writeText(filePath);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            <ContentCopyIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </ControlTooltip>
      </Stack>
    </Box>
  );
}

export function GradeSessionDialog({
  open,
  sessionTitle,
  sessionFilePath,
  current,
  loading,
  error,
  onClose,
  onAnalyze,
  onImplementFinding,
}: GradeSessionDialogProps) {
  const [notes, setNotes] = useState('');
  const analysis = current?.analysis;
  const filePath = analysis?.sessionFilePath || sessionFilePath || null;

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
            AI analyzes <strong>{sessionTitle}</strong>
            {filePath ? ' from the session file' : ''} for excessive turns, wasted tokens, bloated
            context, instruction-file problems, and missing or weak skills.
          </Typography>
          {filePath ? <SessionFilePath filePath={filePath} /> : null}

          {loading && !analysis ? (
            <Stack spacing={1.25} sx={{ alignItems: 'center', py: 3 }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                {filePath
                  ? 'Reading the session file, instruction files, and skills…'
                  : 'Reading the transcript, instruction files, and skills…'}
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
                    label={`${analysis.stats.userTurns} user / ${analysis.stats.assistantTurns} assistant turns`}
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
                    return finding ? (
                      <FindingCard
                        key={category}
                        finding={finding}
                        onImplement={onImplementFinding}
                      />
                    ) : null;
                  })}
                </Stack>
              ) : null}
            </Stack>
          ) : null}

          <ControlTooltip title="Optional notes to guide the next analysis">
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
          </ControlTooltip>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <ControlTooltip title="Close without saving">
          <Button onClick={onClose} disabled={loading}>
            Close
          </Button>
        </ControlTooltip>
        <ControlTooltip title={current ? 'Re-run AI analysis on this session' : 'Run AI analysis on this session'}>
          <Button variant="contained" disabled={loading} onClick={() => onAnalyze(notes)}>
            {loading ? 'Analyzing…' : current ? 'Analyze again' : 'Analyze session'}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
