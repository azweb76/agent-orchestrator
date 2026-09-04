import { useNavigate } from 'react-router-dom';
import { Alert, Stack } from '@mui/material';
import { DashboardMetricsRow } from '../components/dashboard/DashboardMetricsRow';
import { FlightBoard } from '../components/dashboard/FlightBoard';
import { useDashboardData } from '../components/dashboard/useDashboardData';
import { PageHeader } from '../components/ui/PageHeader';

export function FlightControllerPage() {
  const navigate = useNavigate();
  const data = useDashboardData('');
  const flightLanes = data.flightLanes;

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Airspace"
        title="Flight controller"
        description="Active agents as flights from planning through a merged PR. Click a plane to open the agent."
      />

      {(data.sidebarError as Error | undefined) && (
        <Alert severity="error">{(data.sidebarError as Error).message}</Alert>
      )}

      <DashboardMetricsRow
        runningCount={data.runningCount}
        orchestratorProcessCount={data.orchestratorProcessCount}
        externalProcessCount={data.externalProcessCount}
        idleCount={data.idleCount}
        workspaceCount={data.workspaces?.length ?? 0}
        prCount={data.prCount}
        githubConfigured={Boolean(data.status?.githubTokenConfigured)}
        usage={data.usageQuery.data}
        status={data.status}
        boardingCount={flightLanes.boarding.length}
        airborneCount={flightLanes.en_route.length}
        approachCount={flightLanes.approach.length}
        landedCount={flightLanes.landed.length}
      />

      <FlightBoard
        agents={data.filteredFlightAgents}
        loading={data.sidebarLoading}
        onOpenAgent={(agentId) => navigate(`/agents/${agentId}`)}
      />
    </Stack>
  );
}
