import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Slider,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import type { AutomationSettings } from '@agent-orchestrator/shared';
import { AUTOMATION_POLL_MAX_SECONDS, AUTOMATION_POLL_MIN_SECONDS } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { useAutomationSettings } from '../../automation/useAutomationSettings';

function AutomationToggle({
  checked,
  onChange,
  label,
  tooltip,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tooltip: string;
  disabled?: boolean;
}) {
  return (
    <FormControlLabel
      control={
        <ControlTooltip title={tooltip} disabled={disabled}>
          <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        </ControlTooltip>
      }
      label={label}
    />
  );
}

export function AutomationSettingsSection() {
  const { settings, loading, update, checking, checkError, checkNow } = useAutomationSettings();

  const patch = (partial: Partial<AutomationSettings>) => {
    void update(partial);
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info" icon={<SyncOutlinedIcon />}>
        GitHub automations are opt-in and default off. Enabling polling lets the server watch linked
        PRs for CI, review, and merge events. Each action may start a Claude session and spend
        tokens.
      </Alert>
      <Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={checking ? <CircularProgress size={16} /> : undefined}
          disabled={checking}
          onClick={() => void checkNow()}
        >
          Check now
        </Button>
      </Box>
      {checkError && <Alert severity="warning">{checkError}</Alert>}
      <AutomationToggle
        checked={settings.enabled}
        onChange={(enabled) => patch({ enabled })}
        label="Enable GitHub polling"
        tooltip="Poll GitHub for check, review, and merge changes on linked PRs"
        disabled={loading}
      />
      <Box sx={{ px: 1, maxWidth: 420 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Poll interval: {settings.pollIntervalSeconds}s
        </Typography>
        <Slider
          size="small"
          min={AUTOMATION_POLL_MIN_SECONDS}
          max={AUTOMATION_POLL_MAX_SECONDS}
          step={15}
          value={settings.pollIntervalSeconds}
          onChange={(_e, value) => patch({ pollIntervalSeconds: value as number })}
          disabled={loading || !settings.enabled}
          valueLabelDisplay="auto"
          aria-label="Poll interval"
        />
      </Box>
      <AutomationToggle
        checked={settings.autoFixCi}
        onChange={(autoFixCi) => patch({ autoFixCi })}
        label="Auto-start Fix CI on check failure"
        tooltip="Enqueue a Fix CI session when checks fail (max 2 retries per commit)"
        disabled={loading || !settings.enabled}
      />
      <AutomationToggle
        checked={settings.autoAddressReview}
        onChange={(autoAddressReview) => patch({ autoAddressReview })}
        label="Auto-start Address review on new feedback"
        tooltip="Enqueue Address review when new review comments arrive"
        disabled={loading || !settings.enabled}
      />
      <AutomationToggle
        checked={settings.autoArchiveOnMerge}
        onChange={(autoArchiveOnMerge) => patch({ autoArchiveOnMerge })}
        label="Auto-archive when PR merges"
        tooltip="Archive the agent when its linked pull request merges"
        disabled={loading || !settings.enabled}
      />
      <AutomationToggle
        checked={settings.autoArchiveDeleteWorktree}
        onChange={(autoArchiveDeleteWorktree) => patch({ autoArchiveDeleteWorktree })}
        label="Delete worktree when auto-archiving"
        tooltip="Remove the git worktree when auto-archiving (like dashboard prune)"
        disabled={loading || !settings.enabled || !settings.autoArchiveOnMerge}
      />
      <AutomationToggle
        checked={settings.autoArchiveAllowDirty}
        onChange={(autoArchiveAllowDirty) => patch({ autoArchiveAllowDirty })}
        label="Allow auto-archive with uncommitted changes"
        tooltip="Archive even when the worktree has local changes"
        disabled={loading || !settings.enabled || !settings.autoArchiveOnMerge}
      />
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', pt: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          <AutoFixHighOutlinedIcon sx={{ fontSize: 18 }} />
          <Typography variant="caption">Fix CI</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          <RateReviewOutlinedIcon sx={{ fontSize: 18 }} />
          <Typography variant="caption">Address review</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          <ArchiveOutlinedIcon sx={{ fontSize: 18 }} />
          <Typography variant="caption">Auto-archive</Typography>
        </Box>
      </Stack>
    </Stack>
  );
}
