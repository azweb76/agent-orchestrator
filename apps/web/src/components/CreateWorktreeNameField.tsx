import { TextField } from '@mui/material';
import { ControlTooltip } from './ui/ControlTooltip';

/** Default create-agent branch field value — server suggests a name when left as Auto. */
export const AUTO_BRANCH_NAME = 'Auto';

/** Omit when Auto / empty so the API suggests a branch name. */
export function branchForCreateRequest(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') return undefined;
  return trimmed;
}

type CreateWorktreeNameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
};

export function CreateWorktreeNameField({
  value,
  onChange,
  helperText = 'Leave as Auto to suggest a name from the goal or issue',
}: CreateWorktreeNameFieldProps) {
  return (
    <ControlTooltip title="Git branch and worktree folder name for the new agent">
      <TextField
        label="Worktree / branch name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={AUTO_BRANCH_NAME}
        fullWidth
        size="small"
        helperText={helperText}
      />
    </ControlTooltip>
  );
}
