import {
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { ControlTooltip } from './ui/ControlTooltip';

type BranchOption = { name: string };

type CreateWorktreeBranchFieldsProps = {
  branchMode: 'existing' | 'new';
  selectedBranch: string;
  newBranchName: string;
  baseBranch: string;
  branches: BranchOption[];
  onBranchModeChange: (mode: 'existing' | 'new') => void;
  onSelectedBranchChange: (branch: string) => void;
  onNewBranchNameChange: (name: string) => void;
  onBaseBranchChange: (branch: string) => void;
};

export function CreateWorktreeBranchFields({
  branchMode,
  selectedBranch,
  newBranchName,
  baseBranch,
  branches,
  onBranchModeChange,
  onSelectedBranchChange,
  onNewBranchNameChange,
  onBaseBranchChange,
}: CreateWorktreeBranchFieldsProps) {
  return (
    <Stack spacing={2}>
      <FormControl>
        <RadioGroup
          row
          value={branchMode}
          onChange={(e) => onBranchModeChange(e.target.value as 'existing' | 'new')}
          sx={{
            flexDirection: { xs: 'column', sm: 'row' },
            '& .MuiFormControlLabel-root': { mr: { xs: 0, sm: 2 } },
          }}
        >
          <ControlTooltip title="Check out an existing branch for the new worktree">
            <FormControlLabel value="existing" control={<Radio />} label="Existing branch" />
          </ControlTooltip>
          <ControlTooltip title="Create a new branch from a base branch">
            <FormControlLabel value="new" control={<Radio />} label="New branch" />
          </ControlTooltip>
        </RadioGroup>
      </FormControl>

      {branchMode === 'existing' ? (
        <ControlTooltip title="Branch to check out for the new worktree">
          <FormControl fullWidth>
            <InputLabel>Branch</InputLabel>
            <Select
              label="Branch"
              value={selectedBranch}
              onChange={(e) => onSelectedBranchChange(e.target.value)}
            >
              {branches.map((branch) => (
                <MenuItem key={branch.name} value={branch.name}>
                  {branch.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </ControlTooltip>
      ) : (
        <>
          <ControlTooltip title="Name for the new git branch">
            <TextField
              label="New branch name"
              value={newBranchName}
              onChange={(e) => onNewBranchNameChange(e.target.value)}
              placeholder="feature/my-change"
              fullWidth
              required
            />
          </ControlTooltip>
          <ControlTooltip title="Branch to fork from when creating the new branch">
            <FormControl fullWidth>
              <InputLabel>Base branch</InputLabel>
              <Select
                label="Base branch"
                value={baseBranch}
                onChange={(e) => onBaseBranchChange(e.target.value)}
              >
                {branches.map((branch) => (
                  <MenuItem key={branch.name} value={branch.name}>
                    {branch.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </ControlTooltip>
        </>
      )}
    </Stack>
  );
}
