import { Box, Chip, Stack, Typography } from '@mui/material';
import FlightOutlinedIcon from '@mui/icons-material/FlightOutlined';
import type { DashboardAgent } from './dashboardAgents';
import { groupFlightsByLane } from './flightBoardModel';
import { FlightBoardScene } from './FlightBoardScene';
import { HudPanel } from './HudPanel';
import { SectionLabel } from './SectionLabel';
import { EmptyState } from '../ui/EmptyState';

export interface FlightBoardProps {
  agents: DashboardAgent[];
  loading?: boolean;
  onOpenAgent: (agentId: string) => void;
}

export function FlightBoard({ agents, loading, onOpenAgent }: FlightBoardProps) {
  const lanes = groupFlightsByLane(agents);
  const total =
    lanes.boarding.length + lanes.en_route.length + lanes.approach.length + lanes.landed.length;
  const airborne = lanes.en_route.length;
  const clearance = agents.filter((a) => (a.pendingPermissionCount ?? 0) > 0 && a.status !== 'archived')
    .length;

  return (
    <HudPanel sx={{ width: '100%' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2 }}
      >
        <Box>
          <SectionLabel>Flight controller</SectionLabel>
          <Typography variant="h6">Top-down airspace</Typography>
        </Box>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Chip size="small" variant="outlined" label={`${total} flights`} />
          <Chip size="small" color="info" variant="outlined" label={`${airborne} airborne`} />
          {lanes.landed.length > 0 && (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`${lanes.landed.length} landed`}
            />
          )}
          {clearance > 0 && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={`${clearance} awaiting clearance`}
            />
          )}
        </Stack>
      </Stack>

      {loading && total === 0 ? (
        <EmptyState compact icon={<FlightOutlinedIcon />} title="Scanning airspace…" description="Loading agents" />
      ) : total === 0 ? (
        <EmptyState
          compact
          icon={<FlightOutlinedIcon />}
          title="Sky is clear"
          description="Active agents appear here as flights from planning to a merged PR."
        />
      ) : (
        <FlightBoardScene lanes={lanes} onOpenAgent={onOpenAgent} />
      )}
    </HudPanel>
  );
}
