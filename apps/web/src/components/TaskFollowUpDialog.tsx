import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import type {
  CreateTaskFollowUpRequest,
  TaskFollowUp,
  TaskSuggestionKind,
  UpdateTaskFollowUpRequest,
  ChatSessionTemplateId,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from './ui/ControlTooltip';
import { ResponsiveDialog } from './ui/ResponsiveDialog';

type FollowUpFormValues = {
  name: string;
  title: string;
  description: string;
  prompt: string;
  kind: TaskSuggestionKind;
  template: ChatSessionTemplateId | '';
  enabled: boolean;
};

const TEMPLATE_OPTIONS: Array<{ id: ChatSessionTemplateId; label: string }> = [
  { id: 'create-draft-pr', label: 'Create draft PR' },
  { id: 'review', label: 'Review' },
  { id: 'address-review', label: 'Address review' },
  { id: 'fix-ci', label: 'Fix CI' },
  { id: 'resolve-conflicts', label: 'Resolve conflicts' },
  { id: 'build', label: 'Build' },
  { id: 'chat', label: 'Chat' },
];

const emptyValues = (): FollowUpFormValues => ({
  name: '',
  title: '',
  description: '',
  prompt: '',
  kind: 'prompt',
  template: '',
  enabled: true,
});

function valuesFromFollowUp(followUp: TaskFollowUp): FollowUpFormValues {
  return {
    name: followUp.name,
    title: followUp.title,
    description: followUp.description,
    prompt: followUp.prompt,
    kind: followUp.kind,
    template: followUp.template ?? '',
    enabled: followUp.enabled,
  };
}

function toCreateBody(values: FollowUpFormValues): CreateTaskFollowUpRequest {
  return {
    name: values.name.trim(),
    title: values.title.trim(),
    description: values.description.trim(),
    prompt: values.prompt.trim(),
    kind: values.kind,
    template: values.kind === 'start-template' ? values.template || null : null,
    enabled: values.enabled,
  };
}

function toUpdateBody(values: FollowUpFormValues, builtIn: boolean): UpdateTaskFollowUpRequest {
  const body = toCreateBody(values);
  if (builtIn) {
    const { name: _name, ...rest } = body;
    return rest;
  }
  return body;
}

interface TaskFollowUpDialogProps {
  open: boolean;
  followUp: TaskFollowUp | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: CreateTaskFollowUpRequest | UpdateTaskFollowUpRequest) => void;
}

export function TaskFollowUpDialog({
  open,
  followUp,
  saving,
  error,
  onClose,
  onSave,
}: TaskFollowUpDialogProps) {
  const [values, setValues] = useState<FollowUpFormValues>(emptyValues);
  const editing = Boolean(followUp);
  const builtIn = followUp?.builtIn ?? false;

  useEffect(() => {
    if (!open) return;
    setValues(followUp ? valuesFromFollowUp(followUp) : emptyValues());
  }, [open, followUp]);

  const canSave =
    values.title.trim().length > 0 &&
    values.prompt.trim().length > 0 &&
    (editing || values.name.trim().length > 0) &&
    (values.kind !== 'start-template' || Boolean(values.template));

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? 'Edit follow-up' : 'New follow-up'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {builtIn ? (
            <Alert severity="info">
              Built-in follow-ups keep a locked name and kind. You can edit the label, description,
              prompt, and whether it is enabled.
            </Alert>
          ) : null}
          <TextField
            label="Name (slug)"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            disabled={builtIn || saving}
            required
            helperText="Lowercase slug used in APIs (a-z, 0-9, hyphens)."
          />
          <TextField
            label="Title"
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            disabled={saving}
            required
            helperText="Chip label shown in chat."
          />
          <TextField
            label="Description"
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            disabled={saving}
            multiline
            minRows={2}
            helperText="Short subtitle / tooltip."
          />
          <TextField
            label="Prompt"
            value={values.prompt}
            onChange={(e) => setValues((v) => ({ ...v, prompt: e.target.value }))}
            disabled={saving}
            required
            multiline
            minRows={3}
            helperText="Message sent into chat, or handoff prompt for template actions."
          />
          {!builtIn ? (
            <FormControl fullWidth>
              <InputLabel id="followup-kind-label">Kind</InputLabel>
              <Select
                labelId="followup-kind-label"
                label="Kind"
                value={values.kind}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    kind: e.target.value as TaskSuggestionKind,
                    template:
                      e.target.value === 'start-template' ? v.template || 'create-draft-pr' : '',
                  }))
                }
                disabled={saving}
              >
                <MenuItem value="prompt">Prompt (send into chat)</MenuItem>
                <MenuItem value="commit-and-push">Commit and push</MenuItem>
                <MenuItem value="start-template">Start session template</MenuItem>
              </Select>
            </FormControl>
          ) : null}
          {values.kind === 'start-template' && !builtIn ? (
            <FormControl fullWidth>
              <InputLabel id="followup-template-label">Template</InputLabel>
              <Select
                labelId="followup-template-label"
                label="Template"
                value={values.template}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    template: e.target.value as ChatSessionTemplateId | '',
                  }))
                }
                disabled={saving}
              >
                {TEMPLATE_OPTIONS.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
          <FormControlLabel
            control={
              <Switch
                checked={values.enabled}
                onChange={(e) => setValues((v) => ({ ...v, enabled: e.target.checked }))}
                disabled={saving}
              />
            }
            label="Enabled for AI selection"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <ControlTooltip title={!canSave ? 'Title, prompt, and name are required' : ''}>
          <span>
            <Button
              variant="contained"
              disabled={!canSave || saving}
              onClick={() =>
                onSave(editing ? toUpdateBody(values, builtIn) : toCreateBody(values))
              }
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </span>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
