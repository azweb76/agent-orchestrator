import { Box, Typography, keyframes, useTheme } from '@mui/material';
import type { PositionedFlight } from './flightMapLayout';
import { flightTooltip } from './flightBoardModel';
import { ControlTooltip } from '../ui/ControlTooltip';

const cruiseDrift = keyframes`
  0% { transform: translate(-50%, -50%) translate(0, 0); }
  50% { transform: translate(-50%, -50%) translate(8px, -5px); }
  100% { transform: translate(-50%, -50%) translate(0, 0); }
`;

const approachWobble = keyframes`
  0%, 100% { transform: translate(-50%, -50%) translate(0, 0); }
  50% { transform: translate(-50%, -50%) translate(5px, 6px); }
`;

/** Bags roll from the apron into the fuselage. */
const luggageLoad = keyframes`
  0% { transform: translate(-22px, 14px) scale(0.9); opacity: 0; }
  15% { opacity: 1; }
  70% { transform: translate(-2px, 2px) scale(1); opacity: 1; }
  100% { transform: translate(6px, -2px) scale(0.75); opacity: 0; }
`;

/** Bags roll out of the fuselage onto the destination apron. */
const luggageUnload = keyframes`
  0% { transform: translate(4px, -2px) scale(0.75); opacity: 0; }
  20% { opacity: 1; }
  75% { transform: translate(20px, 12px) scale(1); opacity: 1; }
  100% { transform: translate(28px, 18px) scale(0.9); opacity: 0; }
`;

const clearancePulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.25); }
`;

const shadowPulse = keyframes`
  0%, 100% { transform: translate(-40%, 55%) scale(1); opacity: 0.35; }
  50% { transform: translate(-40%, 55%) scale(0.85); opacity: 0.2; }
`;

export interface FlightMapPlaneProps {
  placed: PositionedFlight;
  onOpen: (agentId: string) => void;
}

function TopDownPlaneIcon({ color, size }: { color: string; size: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 48 64"
      sx={{
        width: size,
        height: size * (64 / 48),
        display: 'block',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
      }}
      aria-hidden
    >
      {/* fuselage */}
      <ellipse cx="24" cy="30" rx="5" ry="22" fill={color} />
      {/* wings */}
      <path d="M4 28 L24 22 L44 28 L24 34 Z" fill={color} />
      <path d="M4 28 L24 22 L44 28 L24 34 Z" fill="#ffffff" opacity="0.12" />
      {/* tail */}
      <path d="M18 48 L24 42 L30 48 L24 52 Z" fill={color} />
      {/* cockpit */}
      <ellipse cx="24" cy="14" rx="3.2" ry="4" fill="#f8fafc" opacity="0.92" />
      {/* cargo door hint */}
      <rect x="20" y="26" width="8" height="6" rx="1" fill="#0b1220" opacity="0.35" />
      {/* engines */}
      <ellipse cx="12" cy="30" rx="2.2" ry="3.5" fill="#cbd5e1" opacity="0.85" />
      <ellipse cx="36" cy="30" rx="2.2" ry="3.5" fill="#cbd5e1" opacity="0.85" />
    </Box>
  );
}

function LuggageBag({
  mode,
  active,
  delaySec,
  color,
}: {
  mode: 'load' | 'unload';
  active: boolean;
  delaySec: number;
  color: string;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        left: '50%',
        top: '42%',
        width: 12,
        height: 9,
        ml: '-6px',
        borderRadius: 0.5,
        bgcolor: color,
        border: '1px solid rgba(0,0,0,0.35)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
        animation: `${mode === 'load' ? luggageLoad : luggageUnload} 2.1s ease-in-out infinite`,
        animationDelay: `${delaySec}s`,
        animationPlayState: active ? 'running' : 'paused',
        opacity: active ? 1 : 0.4,
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 2,
          right: 2,
          top: 2,
          height: 2,
          borderRadius: 1,
          bgcolor: 'rgba(255,255,255,0.35)',
        },
      }}
    />
  );
}

export function FlightMapPlane({ placed, onOpen }: FlightMapPlaneProps) {
  const theme = useTheme();
  const { flight, point } = placed;
  const color =
    flight.leg === 'landed'
      ? theme.palette.success.main
      : flight.leg === 'boarding'
        ? theme.palette.warning.main
        : flight.leg === 'approach'
          ? theme.palette.secondary.main
          : theme.palette.info.main;

  const bodyMotion =
    flight.leg === 'en_route'
      ? `${cruiseDrift} ${flight.active ? 2.4 : 4.2}s ease-in-out infinite`
      : flight.leg === 'approach'
        ? `${approachWobble} 2.2s ease-in-out infinite`
        : undefined;

  const showLoad = flight.leg === 'boarding';
  const showUnload = flight.leg === 'landed';
  /** Landed always unloads; boarding only while the agent is active. */
  const luggageActive = showUnload || (showLoad && flight.active);

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
          zIndex: flight.awaitingClearance ? 4 : 3,
          width: 72,
          height: 88,
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
              top: '58%',
              width: 22,
              height: 10,
              borderRadius: '50%',
              bgcolor: 'rgba(0,0,0,0.35)',
              animation: `${shadowPulse} 2.4s ease-in-out infinite`,
              pointerEvents: 'none',
            }}
          />
        )}

        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) rotate(${point.heading + 90}deg)`,
            transition: 'transform 0.4s ease',
          }}
        >
          <TopDownPlaneIcon color={color} size={56} />
        </Box>

        {showLoad && (
          <>
            <LuggageBag mode="load" active={luggageActive} delaySec={0} color="#d97706" />
            <LuggageBag mode="load" active={luggageActive} delaySec={0.7} color="#f59e0b" />
            <LuggageBag mode="load" active={luggageActive} delaySec={1.4} color="#b45309" />
          </>
        )}

        {showUnload && (
          <>
            <LuggageBag mode="unload" active={luggageActive} delaySec={0} color="#34d399" />
            <LuggageBag mode="unload" active={luggageActive} delaySec={0.75} color="#6ee7b7" />
            <LuggageBag mode="unload" active={luggageActive} delaySec={1.5} color="#10b981" />
          </>
        )}

        {flight.awaitingClearance && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: 4,
              right: 8,
              width: 10,
              height: 10,
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
            mt: 0.15,
            transform: 'translateX(-50%) translateY(2px)',
            opacity: 0.9,
            px: 0.7,
            py: 0.2,
            borderRadius: 0.75,
            bgcolor: 'rgba(8, 12, 20, 0.82)',
            color: '#e8eefc',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '0.62rem',
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
