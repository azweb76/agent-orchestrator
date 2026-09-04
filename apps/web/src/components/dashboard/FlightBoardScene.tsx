import { Box, Stack, Typography, keyframes, useTheme } from '@mui/material';
import type { FlightBoardFlight, FlightBoardLanes } from './flightBoardModel';
import { flightTooltip } from './flightBoardModel';
import { FlightPlaneMarker } from './FlightPlaneMarker';
import { ControlTooltip } from '../ui/ControlTooltip';

const waterShimmer = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 100% 50%; }
`;

const islandGlow = keyframes`
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.12); }
`;

const corridorDash = keyframes`
  0% { stroke-dashoffset: 24; }
  100% { stroke-dashoffset: 0; }
`;

interface FlightBoardSceneProps {
  lanes: FlightBoardLanes;
  onOpenAgent: (agentId: string) => void;
}

function LaneStack({
  flights,
  onOpen,
  align = 'center',
}: {
  flights: FlightBoardFlight[];
  onOpen: (id: string) => void;
  align?: 'flex-start' | 'center' | 'flex-end';
}) {
  if (flights.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.55, fontFamily: 'IBM Plex Mono, monospace' }}>
        Clear
      </Typography>
    );
  }
  return (
    <Stack spacing={0.75} sx={{ alignItems: align, width: '100%' }}>
      {flights.slice(0, 8).map((flight) => (
        <ControlTooltip key={flight.id} title={flightTooltip(flight)}>
          <Box>
            <FlightPlaneMarker flight={flight} onOpen={onOpen} />
          </Box>
        </ControlTooltip>
      ))}
      {flights.length > 8 && (
        <Typography variant="caption" color="text.secondary">
          +{flights.length - 8} more
        </Typography>
      )}
    </Stack>
  );
}

function Island({
  label,
  verb,
  side,
}: {
  label: string;
  verb: string;
  side: 'origin' | 'dest';
}) {
  const theme = useTheme();
  const fill =
    side === 'origin' ? theme.palette.warning.main : theme.palette.success.main;
  return (
    <Box
      sx={{
        position: 'relative',
        width: { xs: 88, sm: 110 },
        height: { xs: 72, sm: 88 },
        flexShrink: 0,
        animation: `${islandGlow} 5s ease-in-out infinite`,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: '18% 8% 8% 8%',
          borderRadius: '45% 55% 48% 52%',
          bgcolor: fill,
          opacity: 0.28,
          boxShadow: `0 0 28px ${fill}55`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: '28% 18% 22% 18%',
          borderRadius: '50% 46% 54% 48%',
          bgcolor: fill,
          opacity: 0.55,
        }}
      />
      <Stack
        spacing={0}
        sx={{
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          px: 0.5,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            fontSize: '0.62rem',
            color: 'text.primary',
          }}
        >
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.58rem' }}>
          {verb}
        </Typography>
      </Stack>
    </Box>
  );
}

export function FlightBoardScene({ lanes, onOpenAgent }: FlightBoardSceneProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
        minHeight: { xs: 280, md: 320 },
        background: `
          linear-gradient(180deg, ${ao.surface.panelMuted} 0%, ${ao.surface.inset} 100%),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 18px,
            ${theme.palette.divider}22 18px,
            ${theme.palette.divider}22 19px
          )
        `,
        backgroundSize: '200% 100%, auto',
        animation: `${waterShimmer} 18s linear infinite`,
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 1000 220"
        preserveAspectRatio="none"
        sx={{
          position: 'absolute',
          left: '12%',
          right: '12%',
          top: '42%',
          height: 48,
          width: '76%',
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      >
        <path
          d="M20 110 C 220 40, 780 180, 980 110"
          fill="none"
          stroke={theme.palette.info.main}
          strokeWidth="3"
          strokeDasharray="10 14"
          style={{ animation: `${corridorDash} 2.4s linear infinite` }}
        />
        <path
          d="M20 118 C 220 48, 780 188, 980 118"
          fill="none"
          stroke={theme.palette.secondary.main}
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 2, md: 1.5 }}
        sx={{
          position: 'relative',
          zIndex: 1,
          p: { xs: 1.5, md: 2 },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          minHeight: { xs: 280, md: 320 },
        }}
      >
        <Stack spacing={1} sx={{ width: { xs: '100%', md: 160 }, alignItems: 'center' }}>
          <Island label="Origin" verb="Kickoff" side="origin" />
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'IBM Plex Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'warning.main',
            }}
          >
            Boarding · Planning
          </Typography>
          <LaneStack flights={lanes.boarding} onOpen={onOpenAgent} />
        </Stack>

        <Stack spacing={1} sx={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'IBM Plex Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'info.main',
            }}
          >
            En route · Implementing
          </Typography>
          <LaneStack flights={lanes.en_route} onOpen={onOpenAgent} />
        </Stack>

        <Stack spacing={1} sx={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'IBM Plex Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: lanes.approach.some((f) => f.turbulence) ? 'error.main' : 'secondary.main',
            }}
          >
            Approach · Verifying
          </Typography>
          <LaneStack flights={lanes.approach} onOpen={onOpenAgent} />
        </Stack>

        <Stack spacing={1} sx={{ width: { xs: '100%', md: 160 }, alignItems: 'center' }}>
          <Island label="Merged" verb="Destination" side="dest" />
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'IBM Plex Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'success.main',
            }}
          >
            Landed
          </Typography>
          <LaneStack flights={lanes.landed} onOpen={onOpenAgent} />
        </Stack>
      </Stack>
    </Box>
  );
}
