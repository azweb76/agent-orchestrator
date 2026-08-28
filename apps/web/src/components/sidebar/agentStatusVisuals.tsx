import { Box, LinearProgress } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import type { AgentStatus } from '@agent-orchestrator/shared';

function statusDotColor(status: AgentStatus): string {
  switch (status) {
    case 'running':
      return 'info.main';
    case 'idle':
      return 'success.main';
    case 'stopped':
      return 'warning.main';
    case 'archived':
      return 'text.disabled';
    default:
      return 'text.secondary';
  }
}

export function AgentProgressBar({ status }: { status: AgentStatus }) {
  if (status !== 'running') return null;
  return (
    <LinearProgress
      color="info"
      sx={{
        mt: 0.75,
        height: 3,
        borderRadius: 1,
        bgcolor: 'rgba(124,156,255,0.15)',
      }}
    />
  );
}

export function AgentStatusDot({
  status,
  size = 8,
}: {
  status: AgentStatus;
  size?: number;
}) {
  const running = status === 'running';
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: statusDotColor(status),
        flexShrink: 0,
        boxShadow: running
          ? '0 0 6px 2px rgba(124,156,255,0.85), 0 0 0 3px rgba(124,156,255,0.3)'
          : 'none',
        animation: running ? 'ao-status-glow 1.2s ease-in-out infinite' : 'none',
        '@keyframes ao-status-glow': {
          '0%, 100%': {
            opacity: 1,
            transform: 'scale(1)',
            boxShadow: '0 0 6px 2px rgba(124,156,255,0.85), 0 0 0 3px rgba(124,156,255,0.3)',
          },
          '50%': {
            opacity: 0.75,
            transform: 'scale(0.9)',
            boxShadow: '0 0 12px 4px rgba(124,156,255,1), 0 0 0 4px rgba(124,156,255,0.45)',
          },
        },
      }}
    />
  );
}

export function AgentStatusIcon({
  status,
  selected,
  fontSize = 'small',
}: {
  status: AgentStatus;
  selected?: boolean;
  fontSize?: 'small' | 'medium';
}) {
  const running = status === 'running';
  return (
    <SmartToyOutlinedIcon
      fontSize={fontSize}
      color={selected ? 'secondary' : running ? 'info' : 'inherit'}
      sx={{
        animation: running ? 'ao-agent-spin 2.4s linear infinite' : 'none',
        filter: running
          ? 'drop-shadow(0 0 4px rgba(124,156,255,0.9)) drop-shadow(0 0 8px rgba(124,156,255,0.45))'
          : 'none',
        '@keyframes ao-agent-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      }}
    />
  );
}
