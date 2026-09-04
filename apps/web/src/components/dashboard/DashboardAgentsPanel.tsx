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
import StopIcon from '@mui/icons-material/Stop';
import type { ClaudeProcessInfo } from '@agent-orchestrator/shared';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';

interface DashboardAgentsPanelProps {
  loading: boolean;
  processes: ClaudeProcessInfo[];
  stoppingPid?: number | null;
  onStopProcess?: (process: ClaudeProcessInfo) => void;
}

function processTitle(process: ClaudeProcessInfo): string {
  if (process.ownership === 'orchestrator' && process.agentName) {
    return process.agentName;
  }
  if (process.cwd) {
    const parts = process.cwd.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? process.cwd;
  }
  return `PID ${process.pid}`;
}

function processSubtitle(process: ClaudeProcessInfo): string {
  if (process.ownership === 'orchestrator') {
    const workspace = process.workspaceName ?? 'Unknown workspace';
    return `${workspace} · PID ${process.pid}`;
  }
  if (process.cwd) {
    return `${process.cwd} · PID ${process.pid}`;
  }
  return `PID ${process.pid}`;
}

export function DashboardAgentsPanel({
  loading,
  processes,
  stoppingPid = null,
  onStopProcess,
}: DashboardAgentsPanelProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;
  const ours = processes.filter((p) => p.ownership === 'orchestrator').length;
  const total = processes.length;

  if (!loading && total === 0) {
    return (
      <HudPanel sx={{ flex: 1.4, minWidth: 0, py: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <SectionLabel>Agent fleet</SectionLabel>
            <Typography variant="body2" color="text.secondary">
              No live Claude processes
            </Typography>
          </Box>
          <Chip size="small" label="0 on system" variant="outlined" />
        </Stack>
      </HudPanel>
    );
  }

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
        <Chip
          size="small"
          color="info"
          label={`${total} on system · ${ours} ours`}
          variant="outlined"
        />
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Stack spacing={0.75}>
          {processes.map((process) => {
            const owned = Boolean(process.ownership === 'orchestrator' && process.agentId);
            const stopping = stoppingPid === process.pid;

            return (
              <Stack
                key={`${process.pid}-${process.sessionId ?? 'ext'}`}
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  px: 1.75,
                  py: 1.25,
                  transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  ...(owned
                    ? {
                        '&:hover': {
                          borderColor: 'ao.accent.secondaryBorder',
                          bgcolor: 'ao.accent.secondaryTint',
                        },
                      }
                    : {}),
                }}
              >
                <Box
                  {...(owned
                    ? {
                        component: RouterLink,
                        to: `/agents/${process.agentId}`,
                      }
                    : {})}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    minWidth: 0,
                    flex: 1,
                    textDecoration: 'none',
                    color: 'inherit',
                    ...(owned
                      ? {
                          '&:focus-visible': {
                            outline: '2px solid',
                            outlineColor: 'secondary.main',
                            outlineOffset: 2,
                            borderRadius: 1,
                          },
                        }
                      : {}),
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: 'info.main',
                      boxShadow: `0 0 0 3px ${ao.accent.infoGlow}`,
                      animation: 'ao-pulse 1.4s ease-in-out infinite',
                      '@keyframes ao-pulse': {
                        '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                        '50%': { opacity: 0.65, transform: 'scale(0.85)' },
                      },
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {processTitle(process)}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      sx={{ display: 'block' }}
                    >
                      {processSubtitle(process)}
                    </Typography>
                    <LinearProgress
                      color="info"
                      sx={{
                        mt: 0.75,
                        height: 2,
                        borderRadius: 1,
                        bgcolor: 'ao.accent.infoTint',
                      }}
                    />
                  </Box>
                  <Chip
                    size="small"
                    label={owned ? 'Orchestrator' : 'External'}
                    color={owned ? 'info' : 'default'}
                    variant="outlined"
                    sx={{ flexShrink: 0 }}
                  />
                </Box>

                {onStopProcess ? (
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    startIcon={
                      stopping ? <CircularProgress size={14} color="inherit" /> : <StopIcon />
                    }
                    disabled={stopping}
                    aria-label={`Stop ${processTitle(process)}`}
                    onClick={() => onStopProcess(process)}
                    sx={{ flexShrink: 0, minWidth: 88 }}
                  >
                    Stop
                  </Button>
                ) : null}
              </Stack>
            );
          })}
        </Stack>
      )}
    </HudPanel>
  );
}
