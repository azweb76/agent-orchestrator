import type { AgentStatus, SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';

export type DashboardAgent = SidebarAgent & { workspaceName: string; workspaceId: string };

export function flattenAgents(workspaces: SidebarWorkspace[]): DashboardAgent[] {
  return workspaces.flatMap((workspace) =>
    workspace.agents.map((agent) => ({
      ...agent,
      workspaceName: workspace.name,
      workspaceId: workspace.id,
    })),
  );
}

export function sortAndFilterAgents(agents: DashboardAgent[], query: string): DashboardAgent[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...agents].sort((a, b) => {
      const blocked = (agent: DashboardAgent) => (agent.pendingPermissionCount ?? 0) > 0 ? 0 : 1;
      const rank = (s: AgentStatus) =>
        s === 'running' ? 0 : s === 'idle' ? 1 : s === 'stopped' ? 2 : 3;
      return (
        blocked(a) - blocked(b) ||
        rank(a.status) - rank(b.status) ||
        a.name.localeCompare(b.name)
      );
    });
  }
  return agents.filter((agent) => {
    const haystack = `${agent.name} ${agent.workspaceName} ${agent.worktree.branch}`.toLowerCase();
    return haystack.includes(q);
  });
}
