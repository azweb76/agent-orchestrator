import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { statusColor } from '../../theme';
import { statusLabel } from '../../utils/format';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';
import type { DashboardAgent } from './dashboardAgents';

interface DashboardAgentsPanelProps {
  loading: boolean;
  query: string;
  agents: DashboardAgent[];
  runningCount: number;
  totalCount: number;
}

export function DashboardAgentsPanel({
  loading,
  query,
  agents,
  runningCount,
  totalCount,
}: DashboardAgentsPanelProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;

  return (
    <HudPanel sx={{ flex: 1.4, minWidth: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
      >
        <Box>
          <SectionLabel>Agent fleet</SectionLabel>
          <Typography variant="h6">Live agents</Typography>
        </Box>
        {runningCount > 0 ? (
          <Chip size="small" color="info" label={`${runningCount} running`} variant="outlined" />
        ) : (
          <Chip size="small" label={`${totalCount} total`} variant="outlined" />
        )}
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : agents.length === 0 ? (
        <EmptyState
          compact
          icon={<SmartToyOutlinedIcon />}
          title={query ? 'No agents match' : 'No agents yet'}
          description={
            query
              ? 'Try a different name, workspace, or branch.'
              : 'Create a worktree from a workspace to spin up an agent.'
          }
          action={
            !query ? (
              <ControlTooltip title="Clone a repo and create your first agent">
                <Button
                  component={RouterLink}
                  to="/workspaces"
                  variant="contained"
                  size="small"
                  startIcon={<FolderOpenOutlinedIcon />}
                >
                  Open workspaces
                </Button>
              </ControlTooltip>
            ) : null
          }
        />
      ) : (
        <Stack spacing={0.75}>
          {agents.slice(0, 10).map((agent) => (
            <Box
              key={agent.id}
              component={RouterLink}
              to={`/agents/${agent.id}`}
              sx={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                px: 1.75,
                py: 1.25,
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
                '&:hover': {
                  borderColor: 'ao.accent.secondaryBorder',
                  bgcolor: 'ao.accent.secondaryTint',
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'secondary.main',
                  outlineOffset: 2,
                },
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor:
                      agent.status === 'running'
                        ? 'info.main'
                        : agent.status === 'idle'
                          ? 'success.main'
                          : 'warning.main',
                    boxShadow:
                      agent.status === 'running' ? `0 0 0 3px ${ao.accent.infoGlow}` : 'none',
                    animation:
                      agent.status === 'running' ? 'ao-pulse 1.4s ease-in-out infinite' : 'none',
                    '@keyframes ao-pulse': {
                      '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                      '50%': { opacity: 0.65, transform: 'scale(0.85)' },
                    },
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {agent.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {agent.workspaceName} · {agent.worktree.branch}
                  </Typography>
                  {agent.status === 'running' ? (
                    <LinearProgress
                      color="info"
                      sx={{
                        mt: 0.75,
                        height: 2,
                        borderRadius: 1,
                        bgcolor: 'ao.accent.infoTint',
                      }}
                    />
                  ) : null}
                </Box>
                <Chip
                  size="small"
                  label={statusLabel(agent.status)}
                  color={statusColor(agent.status)}
                  variant="outlined"
                  sx={{ flexShrink: 0 }}
                />
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </HudPanel>
  );
}
