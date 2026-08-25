import { Outlet, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  useSidebarCollapsed,
  WorkspaceSidebar,
} from './WorkspaceSidebar';

export function AppLayout() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: 30_000,
  });

  const onHome = location.pathname === '/';
  const onPulls = location.pathname.startsWith('/pull-requests');
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(11,15,23,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <SmartToyOutlinedIcon sx={{ mr: 1.5, color: 'secondary.main' }} />
          <Typography
            component={RouterLink}
            to="/"
            variant="h6"
            sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 700, mr: 2 }}
          >
            Agent Orchestrator
          </Typography>

          <Stack direction="row" spacing={0.5} sx={{ mr: 2 }}>
            <Button
              component={RouterLink}
              to="/"
              size="small"
              startIcon={<FolderOpenOutlinedIcon />}
              color={onHome ? 'secondary' : 'inherit'}
              sx={{ fontWeight: onHome ? 700 : 500 }}
            >
              Workspaces
            </Button>
            <Button
              component={RouterLink}
              to="/pull-requests"
              size="small"
              startIcon={<MergeTypeIcon />}
              color={onPulls ? 'secondary' : 'inherit'}
              sx={{ fontWeight: onPulls ? 700 : 500 }}
            >
              Pull requests
            </Button>
          </Stack>

          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1}>
            <Chip
              size="small"
              label={status?.claudeInstalled ? 'Claude Code ready' : 'Claude Code missing'}
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
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box
          sx={{
            position: 'sticky',
            top: 64,
            alignSelf: 'flex-start',
            height: 'calc(100vh - 64px)',
            width: sidebarWidth,
            flexShrink: 0,
            transition: (theme) =>
              theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.shorter,
              }),
          }}
        >
          <WorkspaceSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
        </Box>

        <Container
          maxWidth="xl"
          sx={{
            py: 3,
            flex: 1,
            minWidth: 0,
            transition: (theme) =>
              theme.transitions.create('margin', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.shorter,
              }),
          }}
        >
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
