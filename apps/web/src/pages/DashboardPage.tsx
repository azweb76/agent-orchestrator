import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Stack } from '@mui/material';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DashboardAgentsPanel } from '../components/dashboard/DashboardAgentsPanel';
import { DashboardBlockedAgentsPanel } from '../components/dashboard/DashboardBlockedAgentsPanel';
import { DashboardHeroSection } from '../components/dashboard/DashboardHeroSection';
import { DashboardMetricsRow } from '../components/dashboard/DashboardMetricsRow';
import { DashboardSidePanels } from '../components/dashboard/DashboardSidePanels';
import { useDashboardData } from '../components/dashboard/useDashboardData';

export function DashboardPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [pruneOpen, setPruneOpen] = useState(false);

  const data = useDashboardData(query);

  const onCommandSubmit = (event: FormEvent) => {
    event.preventDefault();
    const first = data.filteredAgents[0];
    if (first) navigate(`/agents/${first.id}`);
  };

  const openPrune = () => {
    data.pruneMutation.reset();
    setPruneOpen(true);
  };

  return (
    <Stack spacing={2.5}>
      <DashboardHeroSection
        query={query}
        onQueryChange={setQuery}
        onCommandSubmit={onCommandSubmit}
        githubLogin={data.status?.githubLogin}
        systemsOk={data.systemsOk}
        systemsPartial={data.systemsPartial}
        githubConfigured={Boolean(data.status?.githubTokenConfigured)}
        activeAgents={data.activeAgents}
        inbox={data.inboxQuery.data}
        archivedCount={data.archivedCount}
        onPruneClick={openPrune}
      />

      <DashboardMetricsRow
        runningCount={data.runningCount}
        idleCount={data.idleCount}
        workspaceCount={data.workspaces?.length ?? 0}
        prCount={data.prCount}
        githubConfigured={Boolean(data.status?.githubTokenConfigured)}
        usage={data.usageQuery.data}
        status={data.status}
      />

      {(data.sidebarError as Error | undefined) && (
        <Alert severity="error">{(data.sidebarError as Error).message}</Alert>
      )}

      <DashboardBlockedAgentsPanel agents={data.blockedAgents} />

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ alignItems: 'stretch' }}>
        <DashboardAgentsPanel
          loading={data.sidebarLoading}
          query={query}
          agents={data.filteredAgents}
          runningCount={data.runningCount}
          totalCount={data.activeAgents.length}
        />

        <DashboardSidePanels
          status={data.status}
          runningCount={data.runningCount}
          activeAgentCount={data.activeAgents.length}
          archivedCount={data.archivedCount}
          onPruneClick={openPrune}
          usage={data.usageQuery.data}
          workspacesLoading={data.workspacesLoading}
          recentWorkspaces={data.recentWorkspaces}
          githubConfigured={Boolean(data.status?.githubTokenConfigured)}
          inboxLoading={data.inboxQuery.isLoading}
          recentPrs={data.recentPrs}
        />
      </Stack>

      <ConfirmDialog
        open={pruneOpen}
        title="Prune archived agents?"
        description={
          data.archivedCount === 1
            ? 'This permanently deletes 1 archived agent and removes any worktrees that are no longer in use. Active agents are not affected.'
            : `This permanently deletes ${data.archivedCount} archived agents and removes any worktrees that are no longer in use. Active agents are not affected.`
        }
        confirmLabel="Prune archived"
        confirmColor="warning"
        loading={data.pruneMutation.isPending}
        onCancel={() => {
          setPruneOpen(false);
          data.pruneMutation.reset();
        }}
        onConfirm={() => {
          data.pruneMutation.mutate(undefined, { onSuccess: () => setPruneOpen(false) });
        }}
      />
    </Stack>
  );
}
