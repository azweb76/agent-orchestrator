import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { useSsePollingFallback } from '../api/ssePolling';
import { useThemePreferenceContext } from '../components/ThemePreferenceProvider';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageHeader } from '../components/ui/PageHeader';
import { useNotificationSettings, permissionStatusLabel } from '../notifications';
import type { ThemePreference } from '../themePrefs';
import { AutomationSettingsSection } from '../components/settings/AutomationSettingsSection';

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: { xs: 2, sm: 2.5 },
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 640, lineHeight: 1.5 }}>
        {description}
      </Typography>
      {children}
    </Box>
  );
}

function permissionLabel(permission: NotificationPermission | 'unsupported'): string {
  return permissionStatusLabel(permission);
}

function permissionColor(
  permission: NotificationPermission | 'unsupported',
): 'default' | 'success' | 'warning' | 'error' {
  switch (permission) {
    case 'granted':
      return 'success';
    case 'denied':
      return 'error';
    case 'default':
      return 'warning';
    default:
      return 'default';
  }
}

export function SettingsPage() {
  const notifications = useNotificationSettings();
  const queryClient = useQueryClient();
  const { preference, resolvedMode, setPreference } = useThemePreferenceContext();
  const sseFallback = useSsePollingFallback();
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: sseFallback,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });
  const saveSettings = useMutation({
    mutationFn: (body: Partial<AppSettings>) => api.updateSettings(body),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings'], next);
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });

  const [dailyCapDraft, setDailyCapDraft] = useState('');
  const [perAgentCapDraft, setPerAgentCapDraft] = useState('');
  useEffect(() => {
    if (!settings) return;
    setDailyCapDraft(
      settings.dailySpendCapUsd == null ? '' : String(settings.dailySpendCapUsd),
    );
    setPerAgentCapDraft(
      settings.perAgentSpendCapUsd == null ? '' : String(settings.perAgentSpendCapUsd),
    );
  }, [settings]);

  const onThemeChange = (_event: React.MouseEvent<HTMLElement>, value: ThemePreference | null) => {
    if (value) setPreference(value);
  };

  const onNotificationsToggle = async (checked: boolean) => {
    if (!notifications.supported) return;
    if (checked) {
      const next = await notifications.requestPermission();
      notifications.setEnabled(next === 'granted');
      return;
    }
    notifications.setEnabled(false);
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Manage notifications, appearance, and how this orchestrator instance is protected."
      />

      <SettingsSection
        title="Connections"
        description="Claude Code CLI, GitHub, and Jira status for this instance. Configure via environment variables on the server."
      >
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <ControlTooltip
            title={
              status?.claudeInstalled
                ? 'Claude Code CLI detected'
                : 'Install and authenticate Claude Code'
            }
          >
            <Chip
              size="small"
              label={status?.claudeInstalled ? 'Claude ready' : 'Claude missing'}
              color={status?.claudeInstalled ? 'success' : 'warning'}
              variant="outlined"
            />
          </ControlTooltip>
          <ControlTooltip
            title={
              status?.githubTokenConfigured
                ? 'GitHub token configured'
                : 'Set GITHUB_TOKEN in your environment'
            }
          >
            <Chip
              size="small"
              label={status?.githubTokenConfigured ? 'GitHub connected' : 'No GitHub token'}
              color={status?.githubTokenConfigured ? 'success' : 'default'}
              variant="outlined"
            />
          </ControlTooltip>
          <ControlTooltip
            title={
              status?.jiraConfigured
                ? status.jiraDisplayName
                  ? `Jira connected as ${status.jiraDisplayName}`
                  : 'Jira credentials configured'
                : 'Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN'
            }
          >
            <Chip
              size="small"
              label={status?.jiraConfigured ? 'Jira connected' : 'No Jira token'}
              color={status?.jiraConfigured ? 'success' : 'default'}
              variant="outlined"
            />
          </ControlTooltip>
        </Stack>
      </SettingsSection>

      <SettingsSection
        title="Tasks"
        description="Configure purpose, prompt templates, system prompts, models, effort, and permissions used when starting agent sessions (including Create agent → From goal Auto)."
      >
        <ControlTooltip title="Open the task manager">
          <Button
            component={RouterLink}
            to="/tasks"
            variant="outlined"
            startIcon={<TuneOutlinedIcon />}
          >
            Manage tasks
          </Button>
        </ControlTooltip>
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Get browser alerts when an agent finishes a run or needs your input while you are on another tab."
      >
        {!notifications.supported ? (
          <Alert severity="info">Browser notifications are not supported in this environment.</Alert>
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip size="small" label="Supported" color="default" variant="outlined" />
              <Chip
                size="small"
                label={`Permission: ${permissionLabel(notifications.permission)}`}
                color={permissionColor(notifications.permission)}
                variant="outlined"
              />
              {notifications.permission === 'default' ? (
                <ControlTooltip title="Request browser notification permission">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<NotificationsNoneOutlinedIcon />}
                    onClick={() => void notifications.requestPermission()}
                  >
                    Request permission
                  </Button>
                </ControlTooltip>
              ) : null}
            </Stack>
            <FormControlLabel
              control={
                <ControlTooltip
                  title="Enable agent notifications when a run finishes or needs input"
                  disabled={notifications.permission === 'denied'}
                >
                  <Switch
                    checked={notifications.enabled}
                    onChange={(event) => void onNotificationsToggle(event.target.checked)}
                    disabled={notifications.permission === 'denied'}
                  />
                </ControlTooltip>
              }
              label="Enable agent notifications"
            />
            {notifications.permission === 'denied' ? (
              <Alert severity="warning">
                Notifications are blocked in your browser. Re-enable them in your browser&apos;s site settings,
                then return here to turn agent notifications back on.
              </Alert>
            ) : null}
          </Stack>
        )}
      </SettingsSection>

      <SettingsSection
        title="GitHub automations"
        description="Opt-in server-side polling for CI failures, review feedback, and merged PRs on agents you track. All features default off."
      >
        <AutomationSettingsSection />
      </SettingsSection>

      <SettingsSection
        title="Appearance"
        description="Choose a color scheme. System follows your device preference."
      >
        <Stack spacing={1.5}>
          <ToggleButtonGroup
            exclusive
            value={preference}
            onChange={onThemeChange}
            aria-label="Color scheme"
            size="small"
            sx={{ flexWrap: 'wrap' }}
          >
            <ControlTooltip title="Use dark color scheme">
              <ToggleButton value="dark" aria-label="Dark">
                <DarkModeOutlinedIcon sx={{ mr: 0.75, fontSize: 18 }} />
                Dark
              </ToggleButton>
            </ControlTooltip>
            <ControlTooltip title="Use light color scheme">
              <ToggleButton value="light" aria-label="Light">
                <LightModeOutlinedIcon sx={{ mr: 0.75, fontSize: 18 }} />
                Light
              </ToggleButton>
            </ControlTooltip>
            <ControlTooltip title="Follow device color scheme">
              <ToggleButton value="system" aria-label="System">
                <SettingsBrightnessOutlinedIcon sx={{ mr: 0.75, fontSize: 18 }} />
                System
              </ToggleButton>
            </ControlTooltip>
          </ToggleButtonGroup>
          <Typography variant="body2" color="text.secondary">
            Active scheme: {resolvedMode}
            {preference === 'system' ? ' (from system preference)' : ''}
          </Typography>
        </Stack>
      </SettingsSection>

      <SettingsSection
        title="Spend caps"
        description="Optional daily limits pause new Claude runs when recorded spend exceeds your cap. In-flight runs can finish; new messages queue with a blocked reason."
      >
        <Stack spacing={2} component="form" onSubmit={(event) => event.preventDefault()}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Daily fleet cap (USD)"
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              placeholder="Off"
              value={dailyCapDraft}
              onChange={(event) => setDailyCapDraft(event.target.value)}
              helperText="Leave blank to disable. Uses costs already recorded on assistant turns."
              fullWidth
            />
            <TextField
              label="Per-agent daily cap (USD)"
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              placeholder="Off"
              value={perAgentCapDraft}
              onChange={(event) => setPerAgentCapDraft(event.target.value)}
              helperText="Optional per-agent limit for today’s spend."
              fullWidth
            />
          </Stack>
          <Button
            variant="outlined"
            disabled={saveSettings.isPending || !settings}
            onClick={() => {
              const parseCap = (raw: string) => {
                const trimmed = raw.trim();
                if (!trimmed) return null;
                const value = Number(trimmed);
                return Number.isFinite(value) && value > 0 ? value : null;
              };
              void saveSettings.mutateAsync({
                dailySpendCapUsd: parseCap(dailyCapDraft),
                perAgentSpendCapUsd: parseCap(perAgentCapDraft),
              });
            }}
          >
            Save spend caps
          </Button>
        </Stack>
      </SettingsSection>

      <SettingsSection
        title="Hung-run watchdog"
        description="Optional background checks for stale permissions, idle streams, and dead processes still marked running. Off by default."
      >
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(settings?.watchdogEnabled)}
                onChange={(event) =>
                  void saveSettings.mutateAsync({ watchdogEnabled: event.target.checked })
                }
              />
            }
            label="Enable watchdog"
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Permission wait (minutes)"
              type="number"
              slotProps={{ htmlInput: { min: 1 } }}
              value={settings?.watchdogPermissionMinutes ?? 30}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 1) {
                  void saveSettings.mutateAsync({ watchdogPermissionMinutes: Math.floor(value) });
                }
              }}
              disabled={!settings?.watchdogEnabled}
              fullWidth
            />
            <TextField
              label="Stream idle (minutes)"
              type="number"
              slotProps={{ htmlInput: { min: 1 } }}
              value={settings?.watchdogStreamIdleMinutes ?? 15}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 1) {
                  void saveSettings.mutateAsync({ watchdogStreamIdleMinutes: Math.floor(value) });
                }
              }}
              disabled={!settings?.watchdogEnabled}
              fullWidth
            />
          </Stack>
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(settings?.watchdogStaleRunEnabled)}
                disabled={!settings?.watchdogEnabled}
                onChange={(event) =>
                  void saveSettings.mutateAsync({ watchdogStaleRunEnabled: event.target.checked })
                }
              />
            }
            label="Correct stale running status when the Claude process has exited"
          />
        </Stack>
      </SettingsSection>

      <SettingsSection
        title="Session analysis"
        description='Lets you run "Analyze this session" in chat to grade session quality with Claude. Off by default.'
      >
        <Stack spacing={1}>
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(settings?.analyzeSessionEnabled)}
                onChange={(event) =>
                  void saveSettings.mutateAsync({ analyzeSessionEnabled: event.target.checked })
                }
              />
            }
            label="Enable session analysis"
          />
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(settings?.autoGradeBuildSessionsEnabled)}
                disabled={!settings?.analyzeSessionEnabled}
                onChange={(event) =>
                  void saveSettings.mutateAsync({
                    autoGradeBuildSessionsEnabled: event.target.checked,
                  })
                }
              />
            }
            label="Auto-grade Build / Fix CI sessions after a clean finish"
          />
        </Stack>
      </SettingsSection>

      <SettingsSection
        title="Authentication"
        description="Shows how this instance accepts API access. Preferences stay in your browser only."
      >
        <Stack spacing={1.5}>
          {status?.authRequired ? (
            <>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  size="small"
                  icon={<LockOutlinedIcon />}
                  label="AUTH_TOKEN required"
                  color="warning"
                  variant="outlined"
                />
                <Chip size="small" label="Unlocked" color="success" variant="outlined" />
              </Stack>
              <Typography color="text.secondary">
                This deployment requires the shared <code>AUTH_TOKEN</code>. You passed the gate via{' '}
                <code>AuthGate</code> and your session cookie or stored token.
              </Typography>
            </>
          ) : (
            <>
              <Chip size="small" label="Loopback (no AUTH_TOKEN)" color="success" variant="outlined" />
              <Typography color="text.secondary">
                No <code>AUTH_TOKEN</code> is configured on the server. Local loopback access is enough for
                this single-user setup.
              </Typography>
            </>
          )}
        </Stack>
      </SettingsSection>
    </Stack>
  );
}
