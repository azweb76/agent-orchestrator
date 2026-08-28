import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CLAUDE_EFFORT_LEVELS,
  CLAUDE_MODELS,
  PERMISSION_MODES,
  type EffortLevel,
  type PermissionMode,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from './ui/ControlTooltip';

type CreateWorktreePlannerFieldsProps = {
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  onModelChange: (value: string) => void;
  onEffortChange: (value: EffortLevel) => void;
  onPermissionModeChange: (value: PermissionMode) => void;
};

export function CreateWorktreePlannerFields({
  model,
  effort,
  permissionMode,
  onModelChange,
  onEffortChange,
  onPermissionModeChange,
}: CreateWorktreePlannerFieldsProps) {
  return (
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <ControlTooltip title="Claude model for the planning session">
        <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
          <InputLabel>Model</InputLabel>
          <Select label="Model" value={model} onChange={(e) => onModelChange(e.target.value)}>
            {CLAUDE_MODELS.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </ControlTooltip>
      <ControlTooltip title="How much reasoning effort the model should use">
        <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
          <InputLabel>Effort</InputLabel>
          <Select
            label="Effort"
            value={effort}
            onChange={(e) => onEffortChange(e.target.value as EffortLevel)}
          >
            {CLAUDE_EFFORT_LEVELS.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </ControlTooltip>
      <ControlTooltip title="How much tool access the agent has during planning">
        <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
          <InputLabel>Permissions</InputLabel>
          <Select
            label="Permissions"
            value={permissionMode}
            onChange={(e) => onPermissionModeChange(e.target.value as PermissionMode)}
          >
            {PERMISSION_MODES.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </ControlTooltip>
    </Stack>
  );
}

type CreateWorktreeIssueFieldsProps = {
  issueReference: string;
  placeholder: string;
  onIssueReferenceChange: (value: string) => void;
};

export function CreateWorktreeIssueFields({
  issueReference,
  placeholder,
  onIssueReferenceChange,
}: CreateWorktreeIssueFieldsProps) {
  return (
    <Stack spacing={1.5}>
      <ControlTooltip title="Paste owner/repo#n or a GitHub issue URL for this workspace repository">
        <TextField
          label="GitHub issue"
          value={issueReference}
          onChange={(e) => onIssueReferenceChange(e.target.value)}
          placeholder={placeholder}
          fullWidth
          autoFocus
        />
      </ControlTooltip>
      <Typography variant="body2" color="text.secondary">
        Creates a plan-mode agent with the issue title, body, and recent comments as the first
        message.
      </Typography>
    </Stack>
  );
}
