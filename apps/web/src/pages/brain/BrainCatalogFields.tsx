import {
  Alert,
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
  PERMISSION_MODES,
  type BrainFollowUpDraft,
  type BrainTaskDraft,
  type ChatSessionTemplateId,
  type EffortLevel,
  type PermissionMode,
  type TaskSuggestionKind,
} from '@agent-orchestrator/shared';
import { AllowedToolsEditor } from '../../components/AllowedToolsEditor';

const TEMPLATE_OPTIONS: Array<{ id: ChatSessionTemplateId; label: string }> = [
  { id: 'create-draft-pr', label: 'Create draft PR' },
  { id: 'review', label: 'Review' },
  { id: 'address-review', label: 'Address review' },
  { id: 'fix-ci', label: 'Fix CI' },
  { id: 'resolve-conflicts', label: 'Resolve conflicts' },
  { id: 'build', label: 'Build' },
  { id: 'chat', label: 'Chat' },
];

export function BrainTaskFields({
  draft,
  lockedName,
  onChange,
  onDirty,
}: {
  draft: BrainTaskDraft;
  lockedName?: boolean;
  onChange: (next: BrainTaskDraft) => void;
  onDirty: (key: string) => void;
}) {
  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Name"
          value={draft.name}
          onChange={(event) => {
            onDirty('name');
            onChange({ ...draft, name: event.target.value });
          }}
          disabled={lockedName}
          helperText={lockedName ? 'Built-in task name is locked' : 'lowercase-slug'}
          fullWidth
          required={!draft.id}
        />
        <TextField
          label="Title"
          value={draft.title}
          onChange={(event) => {
            onDirty('title');
            onChange({ ...draft, title: event.target.value });
          }}
          fullWidth
          required
        />
      </Stack>
      <TextField
        label="Description"
        value={draft.description}
        onChange={(event) => {
          onDirty('description');
          onChange({ ...draft, description: event.target.value });
        }}
        fullWidth
        multiline
        minRows={2}
      />
      <TextField
        label="Purpose"
        value={draft.purpose}
        onChange={(event) => {
          onDirty('purpose');
          onChange({ ...draft, purpose: event.target.value });
        }}
        fullWidth
        multiline
        minRows={2}
        helperText="Used by From goal Auto to decide when this task fits."
      />
      <TextField
        label="Prompt template"
        value={draft.promptTemplate}
        onChange={(event) => {
          onDirty('promptTemplate');
          onChange({ ...draft, promptTemplate: event.target.value });
        }}
        fullWidth
        multiline
        minRows={3}
        helperText="Use {{goal}} for From goal text."
      />
      <TextField
        label="System prompt"
        value={draft.systemPrompt}
        onChange={(event) => {
          onDirty('systemPrompt');
          onChange({ ...draft, systemPrompt: event.target.value });
        }}
        fullWidth
        multiline
        minRows={3}
      />
      <AllowedToolsEditor
        value={draft.allowedTools}
        onChange={(allowedTools) => {
          onDirty('allowedTools');
          onChange({ ...draft, allowedTools });
        }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <FormControl fullWidth size="small">
          <InputLabel>Model</InputLabel>
          <Select
            label="Model"
            value={draft.model}
            onChange={(event) => {
              onDirty('model');
              onChange({ ...draft, model: event.target.value });
            }}
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
            value={draft.effort}
            onChange={(event) => {
              onDirty('effort');
              onChange({ ...draft, effort: event.target.value as EffortLevel });
            }}
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
            value={draft.permissionMode}
            onChange={(event) => {
              onDirty('permissionMode');
              onChange({ ...draft, permissionMode: event.target.value as PermissionMode });
            }}
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
            checked={draft.listed}
            onChange={(event) => {
              onDirty('listed');
              onChange({ ...draft, listed: event.target.checked });
            }}
          />
        }
        label="Show in new-session picker"
      />
      <Typography variant="caption" color="text.secondary">
        AskUserQuestion and ExitPlanMode are never auto-approved even if listed in allowed tools.
      </Typography>
    </>
  );
}

export function BrainFollowUpFields({
  draft,
  builtIn,
  onChange,
  onDirty,
}: {
  draft: BrainFollowUpDraft;
  builtIn?: boolean;
  onChange: (next: BrainFollowUpDraft) => void;
  onDirty: (key: string) => void;
}) {
  return (
    <>
      {builtIn ? (
        <Alert severity="info">
          Built-in follow-ups keep a locked name and kind. You can edit the label, description, prompt,
          and whether it is enabled.
        </Alert>
      ) : null}
      <TextField
        label="Name (slug)"
        value={draft.name}
        onChange={(event) => {
          onDirty('name');
          onChange({ ...draft, name: event.target.value });
        }}
        disabled={builtIn}
        required
        fullWidth
      />
      <TextField
        label="Title"
        value={draft.title}
        onChange={(event) => {
          onDirty('title');
          onChange({ ...draft, title: event.target.value });
        }}
        required
        fullWidth
      />
      <TextField
        label="Description"
        value={draft.description}
        onChange={(event) => {
          onDirty('description');
          onChange({ ...draft, description: event.target.value });
        }}
        fullWidth
        multiline
        minRows={2}
      />
      <TextField
        label="Prompt"
        value={draft.prompt}
        onChange={(event) => {
          onDirty('prompt');
          onChange({ ...draft, prompt: event.target.value });
        }}
        required
        fullWidth
        multiline
        minRows={3}
      />
      {!builtIn ? (
        <FormControl fullWidth>
          <InputLabel>Kind</InputLabel>
          <Select
            label="Kind"
            value={draft.kindValue}
            onChange={(event) => {
              onDirty('kindValue');
              const kindValue = event.target.value as TaskSuggestionKind;
              onChange({
                ...draft,
                kindValue,
                template: kindValue === 'start-template' ? draft.template || 'create-draft-pr' : '',
              });
            }}
          >
            <MenuItem value="prompt">Prompt (send into chat)</MenuItem>
            <MenuItem value="commit-and-push">Commit and push</MenuItem>
            <MenuItem value="start-template">Session template</MenuItem>
            <MenuItem value="grade-session">Grade session</MenuItem>
          </Select>
        </FormControl>
      ) : null}
      {draft.kindValue === 'start-template' && !builtIn ? (
        <FormControl fullWidth>
          <InputLabel>Template</InputLabel>
          <Select
            label="Template"
            value={draft.template}
            onChange={(event) => {
              onDirty('template');
              onChange({ ...draft, template: event.target.value as ChatSessionTemplateId | '' });
            }}
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
            checked={draft.enabled}
            onChange={(event) => {
              onDirty('enabled');
              onChange({ ...draft, enabled: event.target.checked });
            }}
          />
        }
        label="Enabled for AI selection"
      />
    </>
  );
}

