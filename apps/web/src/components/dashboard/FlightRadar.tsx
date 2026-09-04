import { Box, Typography, keyframes, useTheme } from '@mui/material';
import type { PositionedFlight } from './flightMapLayout';
import { radarPolar } from './flightMapLayout';

const sweep = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const blipPing = keyframes`
  0%, 100% { opacity: 0.55; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.35); }
`;

export interface FlightRadarProps {
  flights: PositionedFlight[];
  onOpenAgent: (agentId: string) => void;
}

export function FlightRadar({ flights, onOpenAgent }: FlightRadarProps) {
  const theme = useTheme();
  const ring = theme.palette.success.main;

  return (
    <Box
      sx={{
        position: 'absolute',
        right: { xs: 10, md: 14 },
        bottom: { xs: 10, md: 14 },
        width: { xs: 118, sm: 148 },
        height: { xs: 118, sm: 148 },
        borderRadius: '50%',
        border: '2px solid',
        borderColor: `${ring}99`,
        bgcolor: 'rgba(4, 14, 10, 0.82)',
        boxShadow: `0 0 0 1px ${ring}33, 0 12px 28px rgba(0,0,0,0.45)`,
        overflow: 'hidden',
        zIndex: 6,
        backdropFilter: 'blur(6px)',
      }}
      aria-label="Airspace radar"
    >
      {[0.33, 0.66, 1].map((scale) => (
        <Box
          key={scale}
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '1px solid',
            borderColor: `${ring}44`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 1,
          bgcolor: `${ring}33`,
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          width: 1,
          bgcolor: `${ring}33`,
          pointerEvents: 'none',
        }}
      />

      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          background: `conic-gradient(from 0deg, ${ring}00 0deg, ${ring}55 40deg, ${ring}00 70deg)`,
          animation: `${sweep} 3.6s linear infinite`,
          pointerEvents: 'none',
        }}
      />

      {flights.map(({ flight, point }) => {
        const { angle, radius } = radarPolar(point);
        const color =
          flight.leg === 'landed'
            ? theme.palette.success.light
            : flight.leg === 'boarding'
              ? theme.palette.warning.main
              : flight.leg === 'approach'
                ? theme.palette.secondary.light
                : theme.palette.info.light;
        const x = 50 + Math.cos((angle * Math.PI) / 180) * radius * 45;
        const y = 50 + Math.sin((angle * Math.PI) / 180) * radius * 45;
        return (
          <Box
            key={flight.id}
            component="button"
            type="button"
            title={flight.callsign}
            aria-label={`Radar ${flight.callsign}`}
            onClick={() => onOpenAgent(flight.id)}
            sx={{
              appearance: 'none',
              border: 'none',
              padding: 0,
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: color,
              boxShadow: `0 0 8px ${color}`,
              transform: 'translate(-50%, -50%)',
              animation: `${blipPing} ${flight.active ? 1.2 : 2.4}s ease-in-out infinite`,
              cursor: 'pointer',
              zIndex: 2,
            }}
          />
        );
      })}

      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 8,
          textAlign: 'center',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '0.55rem',
          letterSpacing: 1.2,
          color: ring,
          textTransform: 'uppercase',
          pointerEvents: 'none',
          opacity: 0.9,
        }}
      >
        Radar
      </Typography>
    </Box>
  );
}
