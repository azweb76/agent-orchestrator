import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
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
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSseConnectionState } from '../api/events';
import { useSsePollingFallback } from '../api/ssePolling';
import { useNotificationSettings } from '../notifications';
import { paletteShortcutLabel } from './commandPalette/paletteCommands';

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

/** Claude / GitHub readiness chips (used in the app bar and the mobile drawer). */
export function StatusChips({ sx }: { sx?: SxProps<Theme> }) {
  const sseState = useSseConnectionState();
  const sseFallback = useSsePollingFallback();
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: sseFallback,
  });

  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', ...sx }}>
      {sseState === 'disconnected' ? (
        <Tooltip title="Live updates paused — reconnecting…">
          <Chip size="small" label="Offline" color="warning" variant="outlined" />
        </Tooltip>
      ) : null}
      <Tooltip title={status?.claudeInstalled ? 'Claude Code CLI detected' : 'Install and authenticate Claude Code'}>
        <Chip
          size="small"
          label={status?.claudeInstalled ? 'Claude ready' : 'Claude missing'}
          color={status?.claudeInstalled ? 'success' : 'warning'}
          variant="outlined"
        />
      </Tooltip>
      <Tooltip
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
      </Tooltip>
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
  const notifications = useNotificationSettings();

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'rgba(11,15,23,0.88)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
        zIndex: (t) => t.zIndex.drawer + 1,
        pt: 'env(safe-area-inset-top)',
      }}
    >
      <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 }, px: { xs: 1, sm: 2 }, overflow: 'hidden' }}>
        {isMobile ? (
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Open navigation"
            onClick={onOpenMobileNav}
            sx={{ mr: 0.5 }}
          >
            <MenuIcon />
          </IconButton>
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
                <Button
                  key={item.to}
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
              );
            })}
          </Stack>
        ) : null}

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title={`Command palette (${paletteShortcutLabel()})`}>
          <IconButton
            size="small"
            color="inherit"
            onClick={onOpenPalette}
            aria-label="Open command palette"
            sx={{ mr: 0.5 }}
          >
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Settings">
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
        </Tooltip>

        {notifications.supported ? (
          <Tooltip
            title={
              notifications.enabled
                ? 'Notifications on — you will be alerted when agents finish or need input'
                : 'Turn on notifications for finished runs and permission prompts'
            }
          >
            <IconButton
              size="small"
              color={notifications.enabled ? 'secondary' : 'inherit'}
              onClick={() => void notifications.toggle()}
              aria-label={notifications.enabled ? 'Disable notifications' : 'Enable notifications'}
              sx={{ mr: 0.5 }}
            >
              {notifications.enabled ? (
                <NotificationsActiveIcon fontSize="small" />
              ) : (
                <NotificationsNoneIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        ) : null}

        <StatusChips sx={{ display: { xs: 'none', sm: 'flex' }, flexShrink: 0 }} />
      </Toolbar>
    </AppBar>
  );
}
