import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useSseConnectionState } from '../../api/events';
import { useSsePollingFallback } from '../../api/ssePolling';
import { flattenAgents, sortAndFilterAgents } from './dashboardAgents';

export function useDashboardData(query: string) {
  const queryClient = useQueryClient();
  const sseState = useSseConnectionState();
  const sseFallback = useSsePollingFallback();

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: sseFallback,
  });

  const pruneMutation = useMutation({
    mutationFn: () => api.pruneArchivedAgents(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
    },
  });

  const {
    data: sidebar,
    isLoading: sidebarLoading,
    error: sidebarError,
  } = useQuery({
    queryKey: ['sidebar'],
    queryFn: api.listSidebar,
    refetchInterval: (q) => {
      if (sseState === 'connected') return false;
      const data = q.state.data;
      if (!data) return 15_000;
      const running = data.some((ws) => ws.agents.some((agent) => agent.status === 'running'));
      return running ? 15_000 : sseFallback || false;
    },
  });

  const { data: workspaces, isLoading: workspacesLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
  });

  const inboxQuery = useQuery({
    queryKey: ['pulls-inbox'],
    queryFn: api.getPullRequestInbox,
    enabled: Boolean(status?.githubTokenConfigured),
    refetchInterval: sseFallback,
  });

  const usageQuery = useQuery({
    queryKey: ['usage'],
    queryFn: api.getUsageSummary,
    refetchInterval: sseFallback,
  });

  const agents = useMemo(() => flattenAgents(sidebar ?? []), [sidebar]);
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status !== 'archived'),
    [agents],
  );
  const runningCount = activeAgents.filter((a) => a.status === 'running').length;
  const idleCount = activeAgents.filter((a) => a.status === 'idle').length;
  const blockedAgents = useMemo(
    () => activeAgents.filter((agent) => (agent.pendingPermissionCount ?? 0) > 0),
    [activeAgents],
  );

  const prCount =
    (inboxQuery.data?.authored.length ?? 0) + (inboxQuery.data?.reviewRequested.length ?? 0);

  const systemsOk = Boolean(status?.claudeInstalled && status?.githubTokenConfigured);
  const systemsPartial = Boolean(status?.claudeInstalled || status?.githubTokenConfigured);

  const filteredAgents = useMemo(
    () => sortAndFilterAgents(activeAgents, query),
    [activeAgents, query],
  );

  const recentWorkspaces = workspaces?.slice(0, 6) ?? [];
  const recentPrs = [
    ...(inboxQuery.data?.authored ?? []).slice(0, 3),
    ...(inboxQuery.data?.reviewRequested ?? []).slice(0, 2),
  ].slice(0, 5);
  const archivedCount = status?.archivedAgentCount ?? 0;

  return {
    status,
    pruneMutation,
    sidebarLoading,
    sidebarError,
    workspacesLoading,
    inboxQuery,
    usageQuery,
    activeAgents,
    runningCount,
    idleCount,
    blockedAgents,
    prCount,
    systemsOk,
    systemsPartial,
    filteredAgents,
    recentWorkspaces,
    recentPrs,
    archivedCount,
    workspaces,
  };
}
