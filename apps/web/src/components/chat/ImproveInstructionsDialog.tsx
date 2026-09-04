import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  GenerateInstructionDraftRequest,
  InstructionDraft,
  InstructionFileKind,
  InstructionFileScope,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { ResponsiveDialog } from '../ui/ResponsiveDialog';

interface ImproveInstructionsDialogProps {
  open: boolean;
  agentId: string;
  sessionId: string;
  onClose: () => void;
  onApplied: () => void;
  /** Pre-select a target kind, e.g. when seeded from a specific grade finding. */
  initialKind?: InstructionFileKind;
  /** Pre-select a scope, only meaningful when initialKind is 'skill'. */
  initialScope?: InstructionFileScope;
  /** Pre-fill extra notes, e.g. context from a specific grade finding. */
  initialExtraNotes?: string;
  /** Pre-generated draft from a persisted instruction offer. */
  initialDraft?: InstructionDraft | null;
}

type TargetMode = 'new_skill' | 'claude_md' | 'agents_md' | 'existing';

const KIND_TO_MODE: Record<InstructionFileKind, TargetMode> = {
  skill: 'new_skill',
  claude_md: 'claude_md',
  agents_md: 'agents_md',
};

export function ImproveInstructionsDialog({
  open,
  agentId,
  sessionId,
  onClose,
  onApplied,
  initialKind,
  initialScope,
  initialExtraNotes,
  initialDraft,
}: ImproveInstructionsDialogProps) {
  const [mode, setMode] = useState<TargetMode>(() => (initialKind ? KIND_TO_MODE[initialKind] : 'new_skill'));
  const [scope, setScope] = useState<InstructionFileScope>(initialScope ?? 'project');
  const [skillName, setSkillName] = useState('');
  const [existingKey, setExistingKey] = useState('');
  const [extraNotes, setExtraNotes] = useState(initialExtraNotes ?? '');
  const [draft, setDraft] = useState<InstructionDraft | null>(initialDraft ?? null);
  const [content, setContent] = useState(initialDraft?.content ?? '');
  const [appliedPath, setAppliedPath] = useState<string | null>(null);

  const filesQuery = useQuery({
    queryKey: ['instruction-files', agentId],
    queryFn: () => api.listInstructionFiles(agentId),
    enabled: open && Boolean(agentId),
  });

  const existingFiles = filesQuery.data ?? [];
  const existingOptions = useMemo(
    () => existingFiles.filter((item) => item.exists),
    [existingFiles],
  );

  useEffect(() => {
    if (!open) return;
    setMode(initialKind ? KIND_TO_MODE[initialKind] : 'new_skill');
    setScope(initialScope ?? 'project');
    setSkillName(initialDraft?.name ?? '');
    setExistingKey('');
    setExtraNotes(initialExtraNotes ?? '');
    setDraft(initialDraft ?? null);
    setContent(initialDraft?.content ?? '');
    setAppliedPath(null);
  }, [open, agentId, sessionId, initialKind, initialScope, initialExtraNotes, initialDraft]);

  useEffect(() => {
    if (existingKey || existingOptions.length === 0) return;
    const first = existingOptions[0]!;
    setExistingKey(`${first.scope}:${first.relativePath}`);
  }, [existingKey, existingOptions]);

  const selectedExisting = existingOptions.find(
    (item) => `${item.scope}:${item.relativePath}` === existingKey,
  );

  const buildRequest = (): GenerateInstructionDraftRequest => {
    if (mode === 'existing' && selectedExisting) {
      return {
        kind: selectedExisting.kind,
        scope: selectedExisting.scope,
        relativePath: selectedExisting.relativePath,
        extraNotes: extraNotes.trim() || undefined,
      };
    }
    if (mode === 'claude_md') {
      return { kind: 'claude_md', extraNotes: extraNotes.trim() || undefined };
    }
    if (mode === 'agents_md') {
      return { kind: 'agents_md', extraNotes: extraNotes.trim() || undefined };
    }
    return {
      kind: 'skill',
      scope,
      name: skillName.trim() || undefined,
      extraNotes: extraNotes.trim() || undefined,
    };
  };

  const generateMutation = useMutation({
    mutationFn: () => api.generateInstructionDraft(agentId, sessionId, buildRequest()),
    onSuccess: (result) => {
      setDraft(result);
      setContent(result.content);
      setAppliedPath(null);
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('Generate a draft first');
      return api.applyInstructionFile(agentId, {
        kind: draft.kind,
        scope: draft.scope,
        relativePath: draft.relativePath,
        name: draft.name,
        content,
      });
    },
    onSuccess: (result) => {
      setAppliedPath(result.relativePath);
      onApplied();
    },
  });

  const kindLabel = (kind: InstructionFileKind) => {
    if (kind === 'claude_md') return 'CLAUDE.md';
    if (kind === 'agents_md') return 'AGENTS.md';
    return 'Skill';
  };

  const generateDisabled =
    generateMutation.isPending || (mode === 'existing' && !selectedExisting);

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Create or improve instructions</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Use this session’s transcript and AI grade to draft a reusable skill or update CLAUDE.md /
            AGENTS.md. Review the markdown before writing it to disk.
          </Typography>

          <ControlTooltip title="Choose what kind of instruction file to create or update">
            <ToggleButtonGroup
              exclusive
              size="small"
              value={mode}
              onChange={(_, value: TargetMode | null) => {
                if (value) {
                  setMode(value);
                  setDraft(null);
                  setContent('');
                  setAppliedPath(null);
                }
              }}
              sx={{ flexWrap: 'wrap' }}
            >
              <ToggleButton value="new_skill">New skill</ToggleButton>
              <ToggleButton value="claude_md">CLAUDE.md</ToggleButton>
              <ToggleButton value="agents_md">AGENTS.md</ToggleButton>
              <ToggleButton value="existing" disabled={existingOptions.length === 0}>
                Existing file
              </ToggleButton>
            </ToggleButtonGroup>
          </ControlTooltip>

          {mode === 'new_skill' ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <ControlTooltip title="Optional slug for the new skill directory">
                <TextField
                  label="Skill name"
                  placeholder="optional-slug"
                  value={skillName}
                  onChange={(event) => setSkillName(event.target.value)}
                  fullWidth
                />
              </ControlTooltip>
              <ControlTooltip title="Project skills live in the repo; personal skills apply across repos">
                <FormControl sx={{ minWidth: { sm: 160 } }}>
                  <InputLabel id="skill-scope-label">Scope</InputLabel>
                  <Select
                    labelId="skill-scope-label"
                    label="Scope"
                    value={scope}
                    onChange={(event) => setScope(event.target.value as InstructionFileScope)}
                  >
                    <MenuItem value="project">Project</MenuItem>
                    <MenuItem value="personal">Personal</MenuItem>
                  </Select>
                </FormControl>
              </ControlTooltip>
            </Stack>
          ) : null}

          {mode === 'existing' ? (
            <ControlTooltip title="Pick an existing instruction file to update">
              <FormControl fullWidth>
                <InputLabel id="existing-file-label">File</InputLabel>
                <Select
                  labelId="existing-file-label"
                  label="File"
                  value={existingKey}
                  onChange={(event) => setExistingKey(event.target.value)}
                >
                  {existingOptions.map((item) => (
                    <MenuItem key={`${item.scope}:${item.relativePath}`} value={`${item.scope}:${item.relativePath}`}>
                      {item.relativePath} · {item.scope}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </ControlTooltip>
          ) : null}

          <ControlTooltip title="Optional guidance for the draft generator">
            <TextField
              label="Extra notes"
              value={extraNotes}
              onChange={(event) => setExtraNotes(event.target.value)}
              fullWidth
              multiline
              minRows={2}
              placeholder="Optional: what the next agent should always do or avoid"
            />
          </ControlTooltip>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <ControlTooltip
              title={draft ? 'Regenerate the draft with current settings' : 'Generate a draft from this session'}
              disabled={generateDisabled}
            >
              <Button
                variant={draft ? 'outlined' : 'contained'}
                onClick={() => generateMutation.mutate()}
                disabled={generateDisabled}
              >
                {generateMutation.isPending ? 'Generating…' : draft ? 'Regenerate' : 'Generate draft'}
              </Button>
            </ControlTooltip>
            {filesQuery.isError ? (
              <Typography variant="caption" color="error">
                {(filesQuery.error as Error).message}
              </Typography>
            ) : null}
          </Stack>

          {generateMutation.error ? (
            <Alert severity="error">{(generateMutation.error as Error).message}</Alert>
          ) : null}

          {draft ? (
            <Stack spacing={1.5}>
              <Alert severity="info">
                {kindLabel(draft.kind)} · {draft.action} {draft.relativePath}
                {draft.rationale ? ` — ${draft.rationale}` : ''}
              </Alert>
              <ControlTooltip title="Edit the generated markdown before writing to disk">
                <TextField
                  label="Draft"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  fullWidth
                  multiline
                  minRows={12}
                  slotProps={{
                    input: {
                      sx: {
                        fontFamily: '"IBM Plex Mono", monospace',
                        fontSize: 13,
                        lineHeight: 1.5,
                      },
                    },
                  }}
                />
              </ControlTooltip>
            </Stack>
          ) : null}

          {applyMutation.error ? (
            <Alert severity="error">{(applyMutation.error as Error).message}</Alert>
          ) : null}
          {appliedPath ? (
            <Alert severity="success">Wrote {appliedPath}</Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <ControlTooltip title="Close without writing changes">
          <Button onClick={onClose}>Close</Button>
        </ControlTooltip>
        <ControlTooltip
          title="Write the reviewed draft to disk"
          disabled={!draft || !content.trim() || applyMutation.isPending}
        >
          <Button
            variant="contained"
            disabled={!draft || !content.trim() || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending ? 'Writing…' : 'Write file'}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
