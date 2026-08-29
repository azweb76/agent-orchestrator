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
  Typography,
} from '@mui/material';
import {
  CLAUDE_EFFORT_LEVELS,
  CLAUDE_MODELS,
  DEFAULT_EFFORT_LEVEL,
  DEFAULT_PERMISSION_MODE,
  PERMISSION_MODES,
  type CreateSessionProfileRequest,
  type EffortLevel,
  type PermissionMode,
  type SessionProfile,
  type UpdateSessionProfileRequest,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from './ui/ControlTooltip';
import { ResponsiveDialog } from './ui/ResponsiveDialog';

export type SessionProfileFormValues = {
  name: string;
  title: string;
  description: string;
  promptTemplate: string;
  systemPrompt: string;
  allowedTools: string;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  listed: boolean;
};

const emptyValues = (): SessionProfileFormValues => ({
  name: '',
  title: '',
  description: '',
  promptTemplate: '',
  systemPrompt: '',
  allowedTools: '',
  model: CLAUDE_MODELS[0].id,
  effort: DEFAULT_EFFORT_LEVEL,
  permissionMode: DEFAULT_PERMISSION_MODE,
  listed: false,
});

function valuesFromProfile(profile: SessionProfile): SessionProfileFormValues {
  return {
    name: profile.name,
    title: profile.title,
    description: profile.description,
    promptTemplate: profile.promptTemplate ?? '',
    systemPrompt: profile.systemPrompt ?? '',
    allowedTools: profile.allowedTools ?? '',
    model: profile.model,
    effort: profile.effort,
    permissionMode: profile.permissionMode,
    listed: profile.listed,
  };
}

function toCreateBody(values: SessionProfileFormValues): CreateSessionProfileRequest {
  return {
    name: values.name.trim(),
    title: values.title.trim(),
    description: values.description.trim(),
    promptTemplate: values.promptTemplate.trim() || null,
    systemPrompt: values.systemPrompt.trim() || null,
    allowedTools: values.allowedTools.trim() || null,
    model: values.model,
    effort: values.effort,
    permissionMode: values.permissionMode,
    listed: values.listed,
  };
}

function toUpdateBody(values: SessionProfileFormValues, builtIn: boolean): UpdateSessionProfileRequest {
  const body = toCreateBody(values);
  if (builtIn) {
    const { name: _name, ...rest } = body;
    return rest;
  }
  return body;
}

type SessionProfileDialogProps = {
  open: boolean;
  profile: SessionProfile | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: CreateSessionProfileRequest | UpdateSessionProfileRequest) => void;
};

export function SessionProfileDialog({
  open,
  profile,
  saving,
  error,
  onClose,
  onSave,
}: SessionProfileDialogProps) {
  const editing = Boolean(profile);
  const [values, setValues] = useState<SessionProfileFormValues>(emptyValues);

  useEffect(() => {
    if (!open) return;
    setValues(profile ? valuesFromProfile(profile) : emptyValues());
  }, [open, profile]);

  const canSave = Boolean(values.title.trim() && (editing || values.name.trim()));

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? 'Edit session profile' : 'New session profile'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <ControlTooltip title="Unique slug used by actions (e.g. from-goal)">
              <TextField
                label="Name"
                value={values.name}
                onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
                disabled={profile?.builtIn}
                helperText={profile?.builtIn ? 'Built-in profile name is locked' : 'lowercase-slug'}
                fullWidth
                required={!editing}
              />
            </ControlTooltip>
            <ControlTooltip title="Display title in the profile manager">
              <TextField
                label="Title"
                value={values.title}
                onChange={(e) => setValues((prev) => ({ ...prev, title: e.target.value }))}
                fullWidth
                required
              />
            </ControlTooltip>
          </Stack>

          <TextField
            label="Description"
            value={values.description}
            onChange={(e) => setValues((prev) => ({ ...prev, description: e.target.value }))}
            fullWidth
            multiline
            minRows={2}
          />

          <TextField
            label="Prompt template"
            value={values.promptTemplate}
            onChange={(e) => setValues((prev) => ({ ...prev, promptTemplate: e.target.value }))}
            fullWidth
            multiline
            minRows={3}
            helperText="Use {{goal}} for From goal text. Leave blank to send the raw goal."
          />

          <TextField
            label="System prompt"
            value={values.systemPrompt}
            onChange={(e) => setValues((prev) => ({ ...prev, systemPrompt: e.target.value }))}
            fullWidth
            multiline
            minRows={3}
            helperText="Appended to Claude Code’s default system prompt."
          />

          <TextField
            label="Allowed tools"
            value={values.allowedTools}
            onChange={(e) => setValues((prev) => ({ ...prev, allowedTools: e.target.value }))}
            fullWidth
            placeholder="Read,Glob,Grep"
            helperText="Comma-separated --allowedTools override. Blank derives from permission mode."
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Model</InputLabel>
              <Select
                label="Model"
                value={values.model}
                onChange={(e) => setValues((prev) => ({ ...prev, model: e.target.value }))}
              >
                {CLAUDE_MODELS.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Effort</InputLabel>
              <Select
                label="Effort"
                value={values.effort}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, effort: e.target.value as EffortLevel }))
                }
              >
                {CLAUDE_EFFORT_LEVELS.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Permissions</InputLabel>
              <Select
                label="Permissions"
                value={values.permissionMode}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    permissionMode: e.target.value as PermissionMode,
                  }))
                }
              >
                {PERMISSION_MODES.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <FormControlLabel
            control={
              <Switch
                checked={values.listed}
                onChange={(e) => setValues((prev) => ({ ...prev, listed: e.target.checked }))}
              />
            }
            label="Show in new-session picker"
          />

          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="caption" color="text.secondary">
            AskUserQuestion and ExitPlanMode are never auto-approved even if listed in allowed tools.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSave || saving}
          onClick={() =>
            onSave(
              editing && profile
                ? toUpdateBody(values, profile.builtIn)
                : toCreateBody(values),
            )
          }
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
