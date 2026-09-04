import { Box, Typography, keyframes, useTheme } from '@mui/material';
import type { FlightBoardLanes } from './flightBoardModel';
import { positionFlights } from './flightMapLayout';
import { FlightMapPlane } from './FlightMapPlane';
import { FlightMapZoomControls } from './FlightMapZoomControls';
import { FlightRadar } from './FlightRadar';
import { useFlightMapViewport } from './useFlightMapViewport';

const waterDrift = keyframes`
  0% { background-position: 0 0, 0 0; }
  100% { background-position: 120px 40px, -80px 60px; }
`;

const wakeDash = keyframes`
  to { stroke-dashoffset: -28; }
`;

const palmSway = keyframes`
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(3deg); }
`;

interface FlightBoardSceneProps {
  lanes: FlightBoardLanes;
  onOpenAgent: (agentId: string) => void;
}

export function FlightBoardScene({ lanes, onOpenAgent }: FlightBoardSceneProps) {
  const theme = useTheme();
  const placed = positionFlights(lanes);
  const viewport = useFlightMapViewport();
  const deep = '#0a2740';
  const mid = '#123a57';
  const foam = '#7ec8e3';

  return (
    <Box
      onWheel={viewport.onWheel}
      onPointerDown={viewport.onPointerDown}
      onPointerMove={viewport.onPointerMove}
      onPointerUp={viewport.onPointerUp}
      onPointerCancel={viewport.onPointerUp}
      sx={{
        position: 'relative',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
        height: { xs: 360, sm: 420, md: 460 },
        bgcolor: deep,
        cursor: viewport.scale > 1 ? (viewport.panning ? 'grabbing' : 'grab') : 'default',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          transformOrigin: 'center center',
          transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
          transition: viewport.panning ? 'none' : 'transform 0.15s ease-out',
          bgcolor: deep,
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, ${mid} 0%, transparent 45%),
            radial-gradient(ellipse at 80% 60%, #0d3352 0%, transparent 40%),
            repeating-linear-gradient(115deg, transparent 0 14px, ${foam}10 14px 15px),
            repeating-linear-gradient(20deg, transparent 0 22px, ${foam}08 22px 23px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 120px 80px, 100px 70px',
          animation: `${waterDrift} 28s linear infinite`,
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 1000 560"
          preserveAspectRatio="xMidYMid slice"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <defs>
            <linearGradient id="ao-island-origin" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c4a35a" />
              <stop offset="55%" stopColor="#6f9e4a" />
              <stop offset="100%" stopColor="#3f6b32" />
            </linearGradient>
            <linearGradient id="ao-island-dest" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8fd3b0" />
              <stop offset="50%" stopColor="#4f9d6e" />
              <stop offset="100%" stopColor="#2f6b4a" />
            </linearGradient>
            <filter id="ao-soft">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.35" />
            </filter>
          </defs>

          <ellipse cx="480" cy="90" rx="34" ry="18" fill="#2d6b4f" opacity="0.55" />
          <ellipse cx="520" cy="470" rx="42" ry="20" fill="#2a5f48" opacity="0.45" />
          <ellipse cx="300" cy="500" rx="28" ry="14" fill="#355f4a" opacity="0.35" />

          <path
            d="M210 300 C 340 180, 660 380, 790 270"
            fill="none"
            stroke={theme.palette.info.main}
            strokeWidth="2.5"
            strokeDasharray="8 12"
            strokeOpacity="0.55"
            style={{ animation: `${wakeDash} 1.8s linear infinite` }}
          />
          <path
            d="M210 308 C 340 188, 660 388, 790 278"
            fill="none"
            stroke={foam}
            strokeWidth="1"
            strokeOpacity="0.2"
          />

          <g filter="url(#ao-soft)">
            <path
              d="M40 220 C 70 150, 160 130, 210 170 C 250 200, 250 280, 210 330 C 160 380, 70 360, 45 300 C 30 270, 25 250, 40 220 Z"
              fill="url(#ao-island-origin)"
            />
            <ellipse cx="120" cy="250" rx="48" ry="22" fill="#b89a5a" opacity="0.55" />
            <rect x="88" y="242" width="70" height="10" rx="2" fill="#d9c48a" opacity="0.7" />
            <circle
              cx="95"
              cy="200"
              r="7"
              fill="#2f5c28"
              style={{ transformOrigin: '95px 200px', animation: `${palmSway} 3.5s ease-in-out infinite` }}
            />
            <circle
              cx="150"
              cy="190"
              r="9"
              fill="#356b30"
              style={{ transformOrigin: '150px 190px', animation: `${palmSway} 4.2s ease-in-out infinite` }}
            />
            <circle cx="175" cy="230" r="6" fill="#2c5526" />
          </g>
          <text
            x="120"
            y="360"
            textAnchor="middle"
            fill="#f4e8c4"
            fontSize="14"
            fontFamily="IBM Plex Mono, monospace"
            letterSpacing="1.5"
          >
            ORIGIN
          </text>
          <text x="120" y="378" textAnchor="middle" fill="#d7c59a" fontSize="10" fontFamily="IBM Plex Mono, monospace">
            BOARDING
          </text>

          <g filter="url(#ao-soft)">
            <path
              d="M780 180 C 830 140, 930 150, 960 210 C 985 260, 970 340, 910 370 C 850 400, 780 360, 760 300 C 745 260, 750 210, 780 180 Z"
              fill="url(#ao-island-dest)"
            />
            <rect
              x="820"
              y="250"
              width="90"
              height="12"
              rx="2"
              fill="#e8eef5"
              opacity="0.75"
              transform="rotate(-18 865 256)"
            />
            <rect
              x="830"
              y="268"
              width="70"
              height="4"
              rx="1"
              fill="#9aa7b8"
              opacity="0.5"
              transform="rotate(-18 865 270)"
            />
            <circle
              cx="880"
              cy="210"
              r="8"
              fill="#2f6b4a"
              style={{ transformOrigin: '880px 210px', animation: `${palmSway} 3.8s ease-in-out infinite` }}
            />
            <circle cx="910" cy="230" r="6" fill="#3a7a55" />
            <circle cx="845" cy="220" r="7" fill="#2a5f42" />
          </g>
          <text
            x="870"
            y="400"
            textAnchor="middle"
            fill="#d8ffe8"
            fontSize="14"
            fontFamily="IBM Plex Mono, monospace"
            letterSpacing="1.5"
          >
            MERGED
          </text>
          <text x="870" y="418" textAnchor="middle" fill="#a8d8bc" fontSize="10" fontFamily="IBM Plex Mono, monospace">
            DESTINATION
          </text>
        </Box>

        {placed.map((item) => (
          <FlightMapPlane key={item.flight.id} placed={item} onOpen={onOpenAgent} />
        ))}

        {placed.length === 0 && (
          <Typography
            variant="body2"
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              color: foam,
              opacity: 0.7,
              fontFamily: 'IBM Plex Mono, monospace',
            }}
          >
            No traffic in airspace
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          position: 'absolute',
          left: 12,
          top: 10,
          display: 'flex',
          gap: 1.25,
          flexWrap: 'wrap',
          zIndex: 5,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          bgcolor: 'rgba(6, 14, 24, 0.55)',
          backdropFilter: 'blur(4px)',
        }}
      >
        {[
          ['Boarding', theme.palette.warning.main],
          ['En route', theme.palette.info.main],
          ['Approach', theme.palette.secondary.main],
          ['Landed', theme.palette.success.main],
        ].map(([label, color]) => (
          <Typography
            key={label}
            variant="caption"
            sx={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.58rem',
              letterSpacing: 0.6,
              color: '#dbe7ff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color }} />
            {label}
          </Typography>
        ))}
      </Box>

      <FlightMapZoomControls
        scale={viewport.scale}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onReset={viewport.reset}
      />

      <FlightRadar flights={placed} onOpenAgent={onOpenAgent} />
    </Box>
  );
}
