import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import type { ClaudeProcessInfo } from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';

interface DashboardAgentsPanelProps {
  loading: boolean;
  processes: ClaudeProcessInfo[];
  stoppingAgentId?: string | null;
  onStopAgent?: (agentId: string, sessionId: string | null) => void;
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
  stoppingAgentId = null,
  onStopAgent,
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
            const owned = process.ownership === 'orchestrator' && process.agentId;
            const stopping = Boolean(owned && stoppingAgentId === process.agentId);
            const rowSx = {
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
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
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'secondary.main',
                      outlineOffset: 2,
                    },
                  }
                : {}),
            } as const;

            const body = (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
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
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
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
                {owned && onStopAgent ? (
                  <ControlTooltip title="Stop this agent">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Stop ${processTitle(process)}`}
                      disabled={stopping}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onStopAgent(process.agentId!, process.sessionId);
                      }}
                    >
                      {stopping ? <CircularProgress size={16} color="inherit" /> : <StopIcon fontSize="small" />}
                    </IconButton>
                  </ControlTooltip>
                ) : null}
              </Stack>
            );

            if (owned) {
              return (
                <Box
                  key={`${process.pid}-${process.sessionId ?? 'ext'}`}
                  component={RouterLink}
                  to={`/agents/${process.agentId}`}
                  sx={rowSx}
                >
                  {body}
                </Box>
              );
            }

            return (
              <Box key={`${process.pid}-external`} sx={rowSx}>
                {body}
              </Box>
            );
          })}
        </Stack>
      )}
    </HudPanel>
  );
}
