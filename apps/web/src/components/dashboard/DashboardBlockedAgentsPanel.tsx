import { Link as RouterLink } from 'react-router-dom';
import { Box, Chip, Stack, Typography, useTheme } from '@mui/material';
import NotificationImportantOutlinedIcon from '@mui/icons-material/NotificationImportantOutlined';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';
import type { DashboardAgent } from './dashboardAgents';

interface DashboardBlockedAgentsPanelProps {
  agents: DashboardAgent[];
}

export function DashboardBlockedAgentsPanel({ agents }: DashboardBlockedAgentsPanelProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;

  if (agents.length === 0) return null;

  return (
    <HudPanel
      sx={{
        borderColor: 'ao.accent.warningBorder',
        '&::before': {
          background: `linear-gradient(135deg, ${ao.accent.warningTintStrong} 0%, transparent 45%, ${ao.accent.warningTint} 100%)`,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
        <NotificationImportantOutlinedIcon sx={{ color: 'warning.main' }} />
        <Box>
          <SectionLabel>Needs attention</SectionLabel>
          <Typography variant="h6">
            {agents.length === 1
              ? '1 agent is waiting on you'
              : `${agents.length} agents are waiting on you`}
          </Typography>
        </Box>
      </Stack>
      <Stack spacing={0.75}>
        {agents.map((agent) => (
          <Box
            key={agent.id}
            component={RouterLink}
            to={`/agents/${agent.id}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              textDecoration: 'none',
              color: 'inherit',
              border: '1px solid',
              borderColor: 'ao.accent.warningBorder',
              borderRadius: 1.5,
              px: 1.75,
              py: 1,
              transition: 'border-color 0.2s ease, background-color 0.2s ease',
              '&:hover': {
                borderColor: 'warning.main',
                bgcolor: 'ao.accent.warningTint',
              },
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {agent.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {agent.workspaceName} · {agent.worktree.branch}
              </Typography>
            </Box>
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={
                agent.pendingPermissionCount === 1
                  ? '1 pending prompt'
                  : `${agent.pendingPermissionCount} pending prompts`
              }
              sx={{ flexShrink: 0 }}
            />
          </Box>
        ))}
      </Stack>
    </HudPanel>
  );
}
