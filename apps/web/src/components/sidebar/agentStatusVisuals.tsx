import { Box } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import type { AgentStatus, PrStatusSnapshot } from '@agent-orchestrator/shared';

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

export function AgentStatusDot({
  status,
  size = 8,
  stalled = false,
}: {
  status: AgentStatus;
  size?: number;
  stalled?: boolean;
}) {
  const running = status === 'running';
  const dotColor = stalled ? 'warning.main' : statusDotColor(status);
  return (
    <Box
      sx={(theme) => {
        const glow = theme.palette.ao.accent.infoGlow;
        const ring = theme.palette.info.main;
        const runningShadow = `0 0 6px 2px ${ring}, 0 0 0 3px ${glow}`;
        const pulseShadow = `0 0 12px 4px ${ring}, 0 0 0 4px ${glow}`;
        return {
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: dotColor,
          flexShrink: 0,
          boxShadow: running ? runningShadow : 'none',
          animation: running ? 'ao-status-glow 1.2s ease-in-out infinite' : 'none',
          '@keyframes ao-status-glow': {
            '0%, 100%': {
              opacity: 1,
              transform: 'scale(1)',
              boxShadow: runningShadow,
            },
            '50%': {
              opacity: 0.75,
              transform: 'scale(0.9)',
              boxShadow: pulseShadow,
            },
          },
        };
      }}
    />
  );
}

function prStatusDotColor(status: PrStatusSnapshot): string {
  if (status.merged) return 'secondary.main';
  if (status.state === 'closed') return 'error.main';
  switch (status.checksRollup) {
    case 'failure':
      return 'error.main';
    case 'pending':
      return 'warning.main';
    case 'success':
      return 'success.main';
    default:
      return status.draft ? 'text.disabled' : 'success.main';
  }
}

export function PrStatusDot({ status, size = 8 }: { status: PrStatusSnapshot; size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: prStatusDotColor(status),
        flexShrink: 0,
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
      sx={(theme) => ({
        animation: running ? 'ao-agent-spin 2.4s linear infinite' : 'none',
        filter: running
          ? `drop-shadow(0 0 4px ${theme.palette.info.main}) drop-shadow(0 0 8px ${theme.palette.ao.accent.infoGlow})`
          : 'none',
        '@keyframes ao-agent-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      })}
    />
  );
}
