import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AskUserQuestionItem, PermissionRequest } from '@agent-orchestrator/shared';

interface AskUserQuestionCardProps {
  request: PermissionRequest;
  questions: AskUserQuestionItem[];
  submitting?: boolean;
  onSubmit: (answers: Record<string, string>, response?: string) => void;
  onDismiss?: () => void;
}

export function AskUserQuestionCard({
  request,
  questions,
  submitting,
  onSubmit,
  onDismiss,
}: AskUserQuestionCardProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const q of questions) initial[q.question] = [];
    return initial;
  });
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [useOther, setUseOther] = useState<Record<string, boolean>>({});
  const [freeResponse, setFreeResponse] = useState('');

  const canSubmit = useMemo(() => {
    if (freeResponse.trim()) return true;
    if (questions.length === 0) return false;
    return questions.every((q) => {
      if (q.options.length === 0 || useOther[q.question]) {
        return Boolean(otherText[q.question]?.trim());
      }
      return (selections[q.question]?.length ?? 0) > 0;
    });
  }, [freeResponse, otherText, questions, selections, useOther]);

  const toggleMulti = (question: string, label: string) => {
    setUseOther((prev) => ({ ...prev, [question]: false }));
    setSelections((prev) => {
      const current = prev[question] ?? [];
      const next = current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label];
      return { ...prev, [question]: next };
    });
  };

  const chooseSingle = (question: string, label: string) => {
    setUseOther((prev) => ({ ...prev, [question]: false }));
    setSelections((prev) => ({ ...prev, [question]: [label] }));
  };

  const handleSubmit = () => {
    if (freeResponse.trim()) {
      onSubmit({}, freeResponse.trim());
      return;
    }

    const answers: Record<string, string> = {};
    for (const q of questions) {
      if (q.options.length === 0 || useOther[q.question]) {
        answers[q.question] = otherText[q.question]?.trim() ?? '';
      } else {
        answers[q.question] = (selections[q.question] ?? []).join(', ');
      }
    }
    onSubmit(answers);
  };

  return (
    <Box
      sx={{
        mb: 1.5,
        p: 2,
        border: 1,
        borderColor: 'info.main',
        borderRadius: 2,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Claude has questions
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {questions.length > 0
          ? `Answer all questions below to continue (${request.requestId.slice(0, 8)}…)`
          : `Reply below to continue (${request.requestId.slice(0, 8)}…)`}
      </Typography>

      <Stack spacing={2}>
        {questions.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Structured options were not included in this request. Type a freeform reply to continue.
          </Typography>
        )}

        {questions.map((q) => (
          <Box key={q.question}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {q.header ? `${q.header}: ` : ''}
              {q.question}
            </Typography>

            {q.options.length === 0 ? (
              <TextField
                size="small"
                fullWidth
                placeholder="Type your answer"
                value={otherText[q.question] ?? ''}
                disabled={submitting}
                onChange={(e) => {
                  setUseOther((prev) => ({ ...prev, [q.question]: true }));
                  setOtherText((prev) => ({ ...prev, [q.question]: e.target.value }));
                }}
                sx={{ mt: 0.5 }}
              />
            ) : q.multiSelect ? (
              <FormGroup>
                {q.options.map((opt) => (
                  <FormControlLabel
                    key={opt.label}
                    control={
                      <Checkbox
                        size="small"
                        checked={(selections[q.question] ?? []).includes(opt.label)}
                        onChange={() => toggleMulti(q.question, opt.label)}
                        disabled={Boolean(useOther[q.question]) || submitting}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">{opt.label}</Typography>
                        {opt.description && (
                          <Typography variant="caption" color="text.secondary">
                            {opt.description}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                ))}
              </FormGroup>
            ) : (
              <RadioGroup
                value={useOther[q.question] ? '' : (selections[q.question]?.[0] ?? '')}
                onChange={(_, value) => chooseSingle(q.question, value)}
              >
                {q.options.map((opt) => (
                  <FormControlLabel
                    key={opt.label}
                    value={opt.label}
                    disabled={Boolean(useOther[q.question]) || submitting}
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">{opt.label}</Typography>
                        {opt.description && (
                          <Typography variant="caption" color="text.secondary">
                            {opt.description}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            )}

            {q.options.length > 0 && (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={Boolean(useOther[q.question])}
                      disabled={submitting}
                      onChange={(_, checked) => {
                        setUseOther((prev) => ({ ...prev, [q.question]: checked }));
                        if (checked) setSelections((prev) => ({ ...prev, [q.question]: [] }));
                      }}
                    />
                  }
                  label={<Typography variant="body2">Other</Typography>}
                />
                {useOther[q.question] && (
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Type your own answer"
                    value={otherText[q.question] ?? ''}
                    disabled={submitting}
                    onChange={(e) =>
                      setOtherText((prev) => ({ ...prev, [q.question]: e.target.value }))
                    }
                    sx={{ mt: 0.5 }}
                  />
                )}
              </>
            )}
          </Box>
        ))}

        <TextField
          size="small"
          fullWidth
          multiline
          minRows={2}
          label={
            questions.length > 0
              ? 'Or reply freely (skips structured answers)'
              : 'Your reply'
          }
          value={freeResponse}
          disabled={submitting}
          onChange={(e) => setFreeResponse(e.target.value)}
        />

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
          >
            Submit answers
          </Button>
          {onDismiss && (
            <Button variant="text" color="inherit" disabled={submitting} onClick={onDismiss}>
              Skip
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
