import type { SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';

/**
 * Sidebar status filters map onto how the tree already renders agents:
 * "needs-input" is the pending-permission badge, "running" covers active and
 * queued runs, and "idle" is everything at rest (idle or stopped) that is not
 * waiting on the user. Archived agents never reach the sidebar tree — the
 * server excludes them — so there is no archived filter.
 */
export type SidebarStatusFilter = 'running' | 'needs-input' | 'idle';

export const SIDEBAR_STATUS_FILTERS: Array<{ id: SidebarStatusFilter; label: string }> = [
  { id: 'running', label: 'Running' },
  { id: 'needs-input', label: 'Needs input' },
  { id: 'idle', label: 'Idle' },
];

export function agentMatchesStatusFilter(
  agent: SidebarAgent,
  filter: SidebarStatusFilter,
): boolean {
  const needsInput = (agent.pendingPermissionCount ?? 0) > 0;
  const running = agent.status === 'running' || agent.status === 'queued';
  switch (filter) {
    case 'needs-input':
      return needsInput;
    case 'running':
      return running;
    case 'idle':
      return !running && !needsInput;
  }
}

/** Every whitespace-separated token must match somewhere in the haystack. */
function matchesTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function agentHaystack(agent: SidebarAgent): string {
  return `${agent.name} ${agent.worktree.name} ${agent.worktree.branch}`.toLowerCase();
}

function workspaceHaystack(workspace: SidebarWorkspace): string {
  return `${workspace.name} ${workspace.githubOwner}/${workspace.githubRepo}`.toLowerCase();
}

export function isSidebarFilterActive(
  query: string,
  statuses: ReadonlySet<SidebarStatusFilter>,
): boolean {
  return queryTokens(query).length > 0 || statuses.size > 0;
}

/**
 * Filter the workspace → agents tree by a text query (workspace/agent name and
 * branch) and a set of status filters (empty set = all statuses).
 *
 * A workspace whose own name/repo matches the query keeps all of its agents
 * (still narrowed by status); otherwise only matching agents remain and
 * workspaces with no remaining agents are dropped.
 */
export function filterSidebarTree(
  tree: SidebarWorkspace[],
  query: string,
  statuses: ReadonlySet<SidebarStatusFilter>,
): SidebarWorkspace[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0 && statuses.size === 0) return tree;

  const byStatus = (agent: SidebarAgent) =>
    statuses.size === 0 || [...statuses].some((filter) => agentMatchesStatusFilter(agent, filter));

  const result: SidebarWorkspace[] = [];
  for (const workspace of tree) {
    const workspaceMatches = tokens.length === 0 || matchesTokens(workspaceHaystack(workspace), tokens);
    const agents = workspace.agents.filter(
      (agent) =>
        byStatus(agent) &&
        (workspaceMatches || matchesTokens(agentHaystack(agent), tokens)),
    );
    if (agents.length > 0 || (workspaceMatches && statuses.size === 0)) {
      result.push({ ...workspace, agents });
    }
  }
  return result;
}
