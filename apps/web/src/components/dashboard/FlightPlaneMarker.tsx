import { Box, Typography, keyframes, useTheme } from '@mui/material';
import FlightTakeoffOutlinedIcon from '@mui/icons-material/FlightTakeoffOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import type { FlightBoardFlight } from './flightBoardModel';

const luggageLoad = keyframes`
  0% { transform: translate(0, 8px) scale(0.85); opacity: 0.35; }
  35% { transform: translate(10px, -2px) scale(1); opacity: 1; }
  70% { transform: translate(22px, -10px) scale(0.9); opacity: 0.7; }
  100% { transform: translate(28px, -16px) scale(0.6); opacity: 0; }
`;

const cruiseBob = keyframes`
  0%, 100% { transform: translateY(0) rotate(-8deg); }
  50% { transform: translateY(-5px) rotate(-4deg); }
`;

const approachDescend = keyframes`
  0%, 100% { transform: translate(0, 0) rotate(12deg); }
  50% { transform: translate(4px, 6px) rotate(16deg); }
`;

const turbulenceShake = keyframes`
  0%, 100% { transform: translate(0, 0) rotate(10deg); }
  25% { transform: translate(-2px, 3px) rotate(6deg); }
  50% { transform: translate(3px, -2px) rotate(14deg); }
  75% { transform: translate(-1px, 2px) rotate(8deg); }
`;

const trailPulse = keyframes`
  0%, 100% { opacity: 0.15; transform: scaleX(0.7); }
  50% { opacity: 0.55; transform: scaleX(1); }
`;

const clearanceBlink = keyframes`
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
`;

export interface FlightPlaneMarkerProps {
  flight: FlightBoardFlight;
  onOpen: (agentId: string) => void;
  compact?: boolean;
}

export function FlightPlaneMarker({ flight, onOpen, compact }: FlightPlaneMarkerProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;
  const accent = flight.turbulence
    ? theme.palette.error.main
    : flight.leg === 'landed'
      ? theme.palette.success.main
      : flight.leg === 'boarding'
        ? theme.palette.warning.main
        : theme.palette.info.main;

  const planeMotion =
    flight.leg === 'boarding'
      ? undefined
      : flight.turbulence
        ? `${turbulenceShake} 0.55s ease-in-out infinite`
        : flight.leg === 'approach'
          ? `${approachDescend} 2.4s ease-in-out infinite`
          : flight.leg === 'en_route' && flight.active
            ? `${cruiseBob} 2.2s ease-in-out infinite`
            : flight.leg === 'en_route'
              ? `${cruiseBob} 4.5s ease-in-out infinite`
              : undefined;

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(flight.id)}
      aria-label={`${flight.name}, ${flight.phase}`}
      sx={{
        appearance: 'none',
        border: '1px solid',
        borderColor: flight.turbulence ? ao.accent.errorBorder : ao.accent.primaryBorder,
        bgcolor: flight.turbulence ? ao.accent.errorTint : ao.surface.elevated,
        color: 'text.primary',
        borderRadius: 1.5,
        px: compact ? 0.75 : 1,
        py: compact ? 0.5 : 0.75,
        minWidth: compact ? 72 : 96,
        maxWidth: compact ? 110 : 140,
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease',
        '&:hover': {
          borderColor: accent,
          bgcolor: ao.surface.hoverStrong,
          transform: 'translateY(-1px)',
        },
      }}
    >
      {(flight.leg === 'en_route' || flight.leg === 'approach') && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 4,
            top: '50%',
            width: 18,
            height: 2,
            borderRadius: 1,
            bgcolor: accent,
            transformOrigin: 'right center',
            animation: flight.active ? `${trailPulse} 1.6s ease-in-out infinite` : 'none',
            opacity: flight.active ? undefined : 0.2,
          }}
        />
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
        <Box
          sx={{
            display: 'inline-flex',
            color: accent,
            animation: planeMotion,
            animationPlayState: flight.leg === 'boarding' || flight.active || flight.turbulence
              ? 'running'
              : flight.leg === 'en_route'
                ? 'running'
                : 'paused',
          }}
        >
          {flight.turbulence ? (
            <WarningAmberOutlinedIcon sx={{ fontSize: 16 }} />
          ) : (
            <FlightTakeoffOutlinedIcon sx={{ fontSize: 16 }} />
          )}
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontWeight: 700,
            letterSpacing: 0.4,
            fontSize: '0.65rem',
            lineHeight: 1.2,
          }}
          noWrap
        >
          {flight.callsign}
        </Typography>
      </Box>

      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.62rem' }}>
        {flight.name}
      </Typography>

      {flight.leg === 'boarding' && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            right: 6,
            bottom: 4,
            width: 7,
            height: 5,
            borderRadius: 0.4,
            bgcolor: theme.palette.warning.main,
            animation: `${luggageLoad} 1.8s ease-in-out infinite`,
            animationPlayState: flight.active ? 'running' : 'paused',
            opacity: flight.active ? 1 : 0.35,
          }}
        />
      )}

      {flight.awaitingClearance && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: theme.palette.warning.main,
            boxShadow: `0 0 8px ${theme.palette.warning.main}`,
            animation: `${clearanceBlink} 1.2s ease-in-out infinite`,
          }}
        />
      )}
    </Box>
  );
}
