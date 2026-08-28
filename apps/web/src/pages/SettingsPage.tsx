import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSsePollingFallback } from '../api/ssePolling';
import { useThemePreferenceContext } from '../components/ThemePreferenceProvider';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageHeader } from '../components/ui/PageHeader';
import { useNotificationSettings } from '../notifications';
import type { ThemePreference } from '../themePrefs';

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
  switch (permission) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Blocked';
    case 'default':
      return 'Not requested';
    default:
      return 'Unsupported';
  }
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
  const { preference, resolvedMode, setPreference } = useThemePreferenceContext();
  const sseFallback = useSsePollingFallback();
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: sseFallback,
  });

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
        title="Notifications"
        description="Get browser alerts when an agent finishes a run or needs your input while you are on another tab."
      >
        {!notifications.supported ? (
          <Alert severity="info">Browser notifications are not supported in this environment.</Alert>
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
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
                Notifications are blocked in your browser. Allow them in site settings to turn this on.
              </Alert>
            ) : null}
          </Stack>
        )}
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
