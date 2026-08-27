import { useEffect, useState } from 'react';
import { Outlet, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppEventStream } from '../api/events';
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  useSidebarCollapsed,
  WorkspaceSidebar,
} from './WorkspaceSidebar';

const NAV_ITEMS = [
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

export function AppLayout() {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Live cache invalidation + notification fan-out over one SSE connection.
  useAppEventStream();

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: 30_000,
  });

  const onAgent = location.pathname.startsWith('/agents/');
  const desktopSidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
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
              onClick={() => setMobileNavOpen(true)}
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

          <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', sm: 'flex' }, flexShrink: 0 }}>
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
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              '& .MuiDrawer-paper': {
                width: `min(${SIDEBAR_EXPANDED_WIDTH}px, 100vw)`,
                boxSizing: 'border-box',
                bgcolor: 'rgba(18,24,38,0.98)',
                backgroundImage: 'none',
                top: {
                  xs: 'calc(56px + env(safe-area-inset-top, 0px))',
                  sm: 'calc(64px + env(safe-area-inset-top, 0px))',
                },
                height: {
                  xs: 'calc(100dvh - 56px - env(safe-area-inset-top, 0px))',
                  sm: 'calc(100dvh - 64px - env(safe-area-inset-top, 0px))',
                },
                display: 'flex',
                flexDirection: 'column',
              },
            }}
          >
            <Box
              sx={{
                pt: 1.25,
                px: 1.5,
                pb: 1.25,
                borderBottom: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
              }}
            >
              <Stack direction="column" spacing={0.5}>
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
                      onClick={() => setMobileNavOpen(false)}
                      fullWidth
                      sx={{
                        fontWeight: active ? 700 : 500,
                        justifyContent: 'flex-start',
                        px: 1.25,
                        bgcolor: active ? 'rgba(94,234,212,0.08)' : 'transparent',
                      }}
                    >
                      {item.label}
                    </Button>
                  );
                })}
              </Stack>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.25 }}>
                <Chip
                  size="small"
                  label={status?.claudeInstalled ? 'Claude ready' : 'Claude missing'}
                  color={status?.claudeInstalled ? 'success' : 'warning'}
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label={status?.githubTokenConfigured ? 'GitHub connected' : 'No GitHub token'}
                  color={status?.githubTokenConfigured ? 'success' : 'default'}
                  variant="outlined"
                />
              </Stack>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <WorkspaceSidebar
                collapsed={false}
                onCollapsedChange={() => undefined}
                fillHeight
                hideCollapseControl
              />
            </Box>
          </Drawer>
        ) : (
          <Box
            sx={{
              position: 'sticky',
              top: 'calc(64px + env(safe-area-inset-top, 0px))',
              alignSelf: 'flex-start',
              height: 'calc(100dvh - 64px - env(safe-area-inset-top, 0px))',
              width: desktopSidebarWidth,
              flexShrink: 0,
              transition: (t) =>
                t.transitions.create('width', {
                  easing: t.transitions.easing.sharp,
                  duration: t.transitions.duration.shorter,
                }),
            }}
          >
            <WorkspaceSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
          </Box>
        )}

        <Container
          maxWidth="xl"
          sx={{
            pt: onAgent ? { xs: 1, md: 1.5 } : { xs: 2, md: 3 },
            px: { xs: 1.25, sm: 2, md: 3 },
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            pb: onAgent
              ? { xs: 'calc(8px + env(safe-area-inset-bottom, 0px))', sm: 1.5 }
              : { xs: 'calc(16px + env(safe-area-inset-bottom, 0px))', md: 3 },
            ...(onAgent
              ? {
                  height: {
                    xs: 'calc(100dvh - 56px - env(safe-area-inset-top, 0px))',
                    sm: 'calc(100dvh - 64px - env(safe-area-inset-top, 0px))',
                  },
                  overflow: 'hidden',
                }
              : {}),
          }}
        >
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              animation: 'ao-page-in 0.35s ease-out',
              '@keyframes ao-page-in': {
                from: { opacity: 0, transform: 'translateY(6px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            <Outlet />
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
