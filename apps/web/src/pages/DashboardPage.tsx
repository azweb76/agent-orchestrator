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
        sidebar={data.sidebar}
        inbox={data.inboxQuery.data}
        githubIssues={data.issueInboxQuery.data?.assigned ?? []}
        jiraIssues={data.jiraInboxQuery.data?.assigned ?? []}
        workspaces={data.workspaces ?? []}
        archivedCount={data.archivedCount}
        onPruneClick={openPrune}
      />

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
      />

      {(data.sidebarError as Error | undefined) && (
        <Alert severity="error">{(data.sidebarError as Error).message}</Alert>
      )}

      <DashboardBlockedAgentsPanel agents={data.blockedAgents} />

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ alignItems: 'stretch' }}>
        <DashboardAgentsPanel
          loading={data.claudeProcessesLoading}
          processes={data.claudeProcesses}
        />

        <DashboardSidePanels
          status={data.status}
          runningCount={data.orchestratorProcessCount}
          activeAgentCount={data.activeAgents.length}
          archivedCount={data.archivedCount}
          onPruneClick={openPrune}
          usage={data.usageQuery.data}
          workspacesLoading={data.workspacesLoading}
          recentWorkspaces={data.recentWorkspaces}
          githubConfigured={Boolean(data.status?.githubTokenConfigured)}
          jiraConfigured={Boolean(data.status?.jiraConfigured)}
          inboxLoading={data.inboxQuery.isLoading}
          recentPrs={data.recentPrs}
          issuesLoading={data.issueInboxQuery.isLoading}
          recentIssues={data.recentIssues}
          jiraIssuesLoading={data.jiraInboxQuery.isLoading}
          recentJiraIssues={data.recentJiraIssues}
          workspaces={data.workspaces ?? []}
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
