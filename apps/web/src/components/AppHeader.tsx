import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { useSseConnectionState } from '../api/events';
import { useNotificationSettings, permissionStatusLabel } from '../notifications';
import { paletteShortcutLabel } from './commandPalette/paletteCommands';
import { ControlTooltip } from './ui/ControlTooltip';

export const NAV_ITEMS = [
  { to: '/', label: 'Command', icon: <DashboardOutlinedIcon />, match: (path: string) => path === '/' },
  {
    to: '/workspaces',
    label: 'Workspaces',
    icon: <FolderOpenOutlinedIcon />,
    match: (path: string) => path === '/workspaces' || path.startsWith('/workspaces/'),
  },
  {
    to: '/pull-requests',
    label: 'Pull requests',
    icon: <MergeTypeIcon />,
    match: (path: string) => path.startsWith('/pull-requests'),
  },
] as const;

/** Live-connection chip (used in the app bar and the mobile drawer). */
export function StatusChips({ sx }: { sx?: SxProps<Theme> }) {
  const sseState = useSseConnectionState();

  if (sseState !== 'disconnected') return null;

  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', ...sx }}>
      <ControlTooltip title="Live updates paused — reconnecting…">
        <Chip size="small" label="Offline" color="warning" variant="outlined" />
      </ControlTooltip>
    </Stack>
  );
}

interface AppHeaderProps {
  isMobile: boolean;
  onOpenMobileNav: () => void;
  onOpenPalette: () => void;
}

export function AppHeader({ isMobile, onOpenMobileNav, onOpenPalette }: AppHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotificationSettings();

  const notificationTooltip = (() => {
    if (!notifications.supported) return 'Browser notifications are not supported here';
    const status = permissionStatusLabel(notifications.permission);
    if (notifications.permission === 'denied') {
      return `Notifications blocked (${status}) — allow them in browser site settings (Settings page)`;
    }
    if (notifications.enabled) {
      return `Notifications on (${status}) — alerts when agents finish or need input`;
    }
    if (notifications.permission === 'default') {
      return `Notifications off (${status}) — click to request permission and enable alerts`;
    }
    return `Notifications off (${status}) — click to enable alerts for finished runs and permission prompts`;
  })();

  const onNotificationClick = () => {
    if (notifications.permission === 'denied') {
      navigate('/settings');
      return;
    }
    void notifications.toggle();
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="transparent"
      sx={{
        bgcolor: 'ao.surface.header',
        color: 'text.primary',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
        // MuiPaper applies a full border; keep only the bottom edge.
        borderLeft: 0,
        borderRight: 0,
        borderTop: 0,
        zIndex: (t) => t.zIndex.drawer + 1,
        pt: 'env(safe-area-inset-top)',
      }}
    >
      <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 }, px: { xs: 1, sm: 2 }, overflow: 'hidden' }}>
        {isMobile ? (
          <ControlTooltip title="Open navigation">
            <IconButton
              edge="start"
              color="inherit"
              aria-label="Open navigation"
              onClick={onOpenMobileNav}
              sx={{ mr: 0.5 }}
            >
              <MenuIcon />
            </IconButton>
          </ControlTooltip>
        ) : null}

        <SmartToyOutlinedIcon sx={{ color: 'secondary.main', display: { xs: 'none', sm: 'block' } }} />
        <Typography
          component={RouterLink}
          to="/"
          variant="h6"
          sx={{
            color: 'inherit',
            textDecoration: 'none',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            mr: { xs: 1, md: 2 },
            fontSize: { xs: '1rem', sm: '1.15rem' },
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Agent{' '}
          </Box>
          Orchestrator
        </Typography>

        {!isMobile ? (
          <Stack direction="row" spacing={0.25} sx={{ mr: 2 }} role="navigation" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const active = item.match(location.pathname);
              return (
                <ControlTooltip key={item.to} title={`Go to ${item.label}`}>
                  <Button
                    component={RouterLink}
                    to={item.to}
                    size="small"
                    startIcon={item.icon}
                    color={active ? 'secondary' : 'inherit'}
                    aria-current={active ? 'page' : undefined}
                    sx={{
                      fontWeight: active ? 700 : 500,
                      px: 1.5,
                      position: 'relative',
                      '&::after': active
                        ? {
                            content: '""',
                            position: 'absolute',
                            left: 12,
                            right: 12,
                            bottom: 4,
                            height: 2,
                            borderRadius: 1,
                            bgcolor: 'secondary.main',
                          }
                        : undefined,
                    }}
                  >
                    {item.label}
                  </Button>
                </ControlTooltip>
              );
            })}
          </Stack>
        ) : null}

        <Box sx={{ flexGrow: 1 }} />

        <ControlTooltip title={`Command palette (${paletteShortcutLabel()})`}>
          <IconButton
            size="small"
            color="inherit"
            onClick={onOpenPalette}
            aria-label="Open command palette"
            sx={{ mr: 0.5 }}
          >
            <SearchIcon fontSize="small" />
          </IconButton>
        </ControlTooltip>

        <ControlTooltip title="Tasks">
          <IconButton
            component={RouterLink}
            to="/tasks"
            size="small"
            color={location.pathname === '/tasks' ? 'secondary' : 'inherit'}
            aria-label="Tasks"
            aria-current={location.pathname === '/tasks' ? 'page' : undefined}
            sx={{ mr: 0.5 }}
          >
            <TuneOutlinedIcon fontSize="small" />
          </IconButton>
        </ControlTooltip>

        <ControlTooltip title="Settings">
          <IconButton
            component={RouterLink}
            to="/settings"
            size="small"
            color={location.pathname === '/settings' ? 'secondary' : 'inherit'}
            aria-label="Settings"
            aria-current={location.pathname === '/settings' ? 'page' : undefined}
            sx={{ mr: 0.5 }}
          >
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </ControlTooltip>

        {notifications.supported ? (
          <ControlTooltip title={notificationTooltip}>
            <IconButton
              size="small"
              color={
                notifications.permission === 'denied'
                  ? 'warning'
                  : notifications.enabled
                    ? 'secondary'
                    : 'inherit'
              }
              onClick={onNotificationClick}
              aria-label={
                notifications.permission === 'denied'
                  ? 'Notifications blocked — open settings'
                  : notifications.enabled
                    ? 'Disable notifications'
                    : 'Enable notifications'
              }
              sx={{ mr: 0.5 }}
            >
              {notifications.enabled ? (
                <NotificationsActiveIcon fontSize="small" />
              ) : (
                <NotificationsNoneIcon fontSize="small" />
              )}
            </IconButton>
          </ControlTooltip>
        ) : null}

        <StatusChips sx={{ display: { xs: 'none', sm: 'flex' }, flexShrink: 0 }} />
      </Toolbar>
    </AppBar>
  );
}
