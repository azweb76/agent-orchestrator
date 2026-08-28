import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Drawer,
  Stack,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useAppEventStream } from '../api/events';
import { useAppNotifications } from '../notifications';
import { AppHeader, NAV_ITEMS, StatusChips } from './AppHeader';
import { CommandPalette, useCommandPaletteShortcut } from './commandPalette/CommandPalette';
import { CommandPaletteProvider } from './commandPalette/CommandPaletteContext';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { CreateWorktreeDialog } from './CreateWorktreeDialog';
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DRAWER_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  useSidebarCollapsed,
  WorkspaceSidebar,
} from './WorkspaceSidebar';
import { ControlTooltip } from './ui/ControlTooltip';

export function AppLayout() {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newAgentTarget, setNewAgentTarget] = useState<{
    workspaceId: string;
    defaultBranch?: string;
  } | null>(null);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  // Live cache invalidation + notification fan-out over one SSE connection.
  useAppEventStream();
  useAppNotifications();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const paletteHandle = useMemo(() => ({ openPalette }), [openPalette]);
  useCommandPaletteShortcut(useCallback(() => setPaletteOpen((prev) => !prev), []));

  const toggleSidebar = () => {
    if (isMobile) setMobileNavOpen((prev) => !prev);
    else setSidebarCollapsed(!sidebarCollapsed);
  };

  const onAgent = location.pathname.startsWith('/agents/');
  const desktopSidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <CommandPaletteProvider value={paletteHandle}>
      <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader
          isMobile={isMobile}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenPalette={openPalette}
        />

        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
          {isMobile ? (
            <Drawer
              variant="temporary"
              open={mobileNavOpen}
              onClose={() => setMobileNavOpen(false)}
              ModalProps={{ keepMounted: true }}
              sx={{
                '& .MuiDrawer-paper': {
                  width: `min(${SIDEBAR_DRAWER_WIDTH}px, 100vw)`,
                  boxSizing: 'border-box',
                  bgcolor: 'ao.surface.elevated',
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
                      <ControlTooltip key={item.to} title={`Go to ${item.label}`}>
                        <Button
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
                            bgcolor: active ? 'ao.accent.secondaryTint' : 'transparent',
                          }}
                        >
                          {item.label}
                        </Button>
                      </ControlTooltip>
                    );
                  })}
                </Stack>
                <StatusChips sx={{ mt: 1.25 }} />
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

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onToggleSidebar={toggleSidebar}
          onNewAgent={(workspaceId, defaultBranch) =>
            setNewAgentTarget({ workspaceId, defaultBranch })
          }
          onNewWorkspace={() => setCreateWorkspaceOpen(true)}
        />
        {newAgentTarget ? (
          <CreateWorktreeDialog
            open
            onClose={() => setNewAgentTarget(null)}
            workspaceId={newAgentTarget.workspaceId}
            defaultBranch={newAgentTarget.defaultBranch}
          />
        ) : null}
        <CreateWorkspaceDialog
          open={createWorkspaceOpen}
          onClose={() => setCreateWorkspaceOpen(false)}
        />
      </Box>
    </CommandPaletteProvider>
  );
}
