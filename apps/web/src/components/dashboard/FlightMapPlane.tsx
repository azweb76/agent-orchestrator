import { Box, Typography, keyframes, useTheme } from '@mui/material';
import type { PositionedFlight } from './flightMapLayout';
import { flightTooltip } from './flightBoardModel';
import { ControlTooltip } from '../ui/ControlTooltip';

const cruiseDrift = keyframes`
  0% { transform: translate(-50%, -50%) translate(0, 0); }
  50% { transform: translate(-50%, -50%) translate(6px, -4px); }
  100% { transform: translate(-50%, -50%) translate(0, 0); }
`;

const approachWobble = keyframes`
  0%, 100% { transform: translate(-50%, -50%) translate(0, 0); }
  50% { transform: translate(-50%, -50%) translate(4px, 5px); }
`;

const turbulenceJolt = keyframes`
  0%, 100% { transform: translate(-50%, -50%) translate(0, 0) rotate(0deg); }
  25% { transform: translate(-50%, -50%) translate(-3px, 2px) rotate(-6deg); }
  50% { transform: translate(-50%, -50%) translate(3px, -2px) rotate(5deg); }
  75% { transform: translate(-50%, -50%) translate(-2px, 1px) rotate(-3deg); }
`;

const luggageCart = keyframes`
  0% { transform: translate(0, 0); opacity: 0.4; }
  40% { transform: translate(10px, -6px); opacity: 1; }
  100% { transform: translate(18px, -12px); opacity: 0; }
`;

const clearancePulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.25); }
`;

const shadowPulse = keyframes`
  0%, 100% { transform: translate(-40%, 40%) scale(1); opacity: 0.35; }
  50% { transform: translate(-40%, 40%) scale(0.85); opacity: 0.2; }
`;

export interface FlightMapPlaneProps {
  placed: PositionedFlight;
  onOpen: (agentId: string) => void;
}

function TopDownPlaneIcon({ color }: { color: string }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 40 40"
      sx={{ width: 28, height: 28, display: 'block', filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.45))` }}
      aria-hidden
    >
      <ellipse cx="20" cy="20" rx="3.2" ry="14" fill={color} />
      <path d="M6 18 L20 14 L34 18 L20 22 Z" fill={color} />
      <path d="M16 30 L20 26 L24 30 L20 32 Z" fill={color} />
      <circle cx="20" cy="10" r="2.2" fill="#f8fafc" opacity="0.9" />
    </Box>
  );
}

export function FlightMapPlane({ placed, onOpen }: FlightMapPlaneProps) {
  const theme = useTheme();
  const { flight, point } = placed;
  const color = flight.turbulence
    ? theme.palette.error.main
    : flight.leg === 'landed'
      ? theme.palette.success.main
      : flight.leg === 'boarding'
        ? theme.palette.warning.main
        : theme.palette.info.main;

  const bodyMotion =
    flight.turbulence
      ? `${turbulenceJolt} 0.55s ease-in-out infinite`
      : flight.leg === 'en_route'
        ? `${cruiseDrift} ${flight.active ? 2.4 : 4.2}s ease-in-out infinite`
        : flight.leg === 'approach'
          ? `${approachWobble} 2.2s ease-in-out infinite`
          : undefined;

  return (
    <ControlTooltip title={flightTooltip(flight)}>
      <Box
        component="button"
        type="button"
        onClick={() => onOpen(flight.id)}
        aria-label={`${flight.name}, ${flight.phase}`}
        sx={{
          appearance: 'none',
          border: 'none',
          background: 'transparent',
          padding: 0,
          position: 'absolute',
          left: `${point.x}%`,
          top: `${point.y}%`,
          transform: 'translate(-50%, -50%)',
          animation: bodyMotion,
          cursor: 'pointer',
          zIndex: flight.turbulence || flight.awaitingClearance ? 4 : 3,
          '&:hover .ao-flight-label': {
            opacity: 1,
            transform: 'translateX(-50%) translateY(0)',
          },
          '&:focus-visible': {
            outline: `2px solid ${color}`,
            outlineOffset: 4,
            borderRadius: 1,
          },
        }}
      >
        {(flight.leg === 'en_route' || flight.leg === 'approach') && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: '50%',
              top: '60%',
              width: 14,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'rgba(0,0,0,0.35)',
              animation: `${shadowPulse} 2.4s ease-in-out infinite`,
              pointerEvents: 'none',
            }}
          />
        )}

        <Box
          sx={{
            transform: `rotate(${point.heading + 90}deg)`,
            transition: 'transform 0.4s ease',
          }}
        >
          <TopDownPlaneIcon color={color} />
        </Box>

        {flight.leg === 'boarding' && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: 18,
              top: 10,
              width: 8,
              height: 6,
              borderRadius: 0.4,
              bgcolor: theme.palette.warning.light,
              border: '1px solid',
              borderColor: theme.palette.warning.main,
              animation: `${luggageCart} 1.7s ease-in-out infinite`,
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
              top: -2,
              right: -2,
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: theme.palette.warning.main,
              boxShadow: `0 0 10px ${theme.palette.warning.main}`,
              animation: `${clearancePulse} 1.1s ease-in-out infinite`,
            }}
          />
        )}

        <Typography
          className="ao-flight-label"
          variant="caption"
          sx={{
            position: 'absolute',
            left: '50%',
            top: '100%',
            mt: 0.35,
            transform: 'translateX(-50%) translateY(2px)',
            opacity: 0.85,
            px: 0.6,
            py: 0.15,
            borderRadius: 0.75,
            bgcolor: 'rgba(8, 12, 20, 0.78)',
            color: '#e8eefc',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '0.58rem',
            fontWeight: 700,
            letterSpacing: 0.4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
          }}
        >
          {flight.callsign}
        </Typography>
      </Box>
    </ControlTooltip>
  );
}
