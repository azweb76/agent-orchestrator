import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreateWorkspaceRequest,
  SidebarWorkspace,
  UsageSummary,
  AgentUsage,
  SessionUsage,
  WorkspaceWithCounts,
} from '@agent-orchestrator/shared';
import { parseGitHubUrl } from './git.js';
import { type AppContext, nowIso, notify } from './app-context.js';
import { deleteWorktree } from './worktrees.js';

export async function listWorkspaces(ctx: AppContext): Promise<WorkspaceWithCounts[]> {
  const workspaces = ctx.repos.workspaces.list();
  return workspaces.map((workspace) => {
    const worktrees = ctx.repos.worktrees.listByWorkspace(workspace.id);
    const agents = ctx.repos.agents.listByWorkspace(workspace.id);
    return {
      ...workspace,
      worktreeCount: worktrees.length,
      agentCount: agents.length,
    };
  });
}

/** One session query for many agents; pending counts stay in-memory on ClaudeService. */
function batchPendingPermissionCounts(
  ctx: AppContext,
  agentIds: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const agentId of agentIds) counts.set(agentId, 0);
  if (agentIds.length === 0) return counts;

  for (const session of ctx.repos.sessions.listByAgentIds(agentIds)) {
    const pending = ctx.claude.listPendingPermissions(session.id).length;
    if (pending > 0) {
      counts.set(session.agentId, (counts.get(session.agentId) ?? 0) + pending);
    }
  }
  return counts;
}

/** Workspace → agents tree for the persistent app sidebar. */
export async function listSidebarTree(ctx: AppContext): Promise<SidebarWorkspace[]> {
  const workspaces = ctx.repos.workspaces.list();
  const agentIds = workspaces.flatMap((workspace) =>
    ctx.repos.agents.listByWorkspace(workspace.id).map((agent) => agent.id),
  );
  const pendingByAgent = batchPendingPermissionCounts(ctx, agentIds);

  return workspaces.map((workspace) => {
    const worktrees = ctx.repos.worktrees.listByWorkspace(workspace.id);
    const worktreeById = new Map(worktrees.map((worktree) => [worktree.id, worktree]));
    const agents = ctx.repos.agents.listByWorkspace(workspace.id).map((agent) => {
      const worktree = worktreeById.get(agent.worktreeId);
      return {
        ...agent,
        worktree: {
          id: worktree?.id ?? agent.worktreeId,
          name: worktree?.name ?? 'Unknown',
          branch: worktree?.branch ?? '',
          prNumber: worktree?.prNumber ?? null,
        },
        pendingPermissionCount: pendingByAgent.get(agent.id) ?? 0,
      };
    });
    return { ...workspace, agents };
  });
}

/** Fleet-wide cost rollup from persisted assistant turns, grouped per agent and session. */
export function getUsageSummary(ctx: AppContext): UsageSummary {
  const rows = ctx.repos.messages.listCostRows();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const round = (value: number) => Number(value.toFixed(4));

  type SessionAccumulator = { costUsd: number; assistantTurns: number; lastActivityAt: string | null };
  const byAgent = new Map<string, Map<string, SessionAccumulator>>();
  let totalCostUsd = 0;
  let todayCostUsd = 0;
  let totalAssistantTurns = 0;

  for (const row of rows) {
    if (!Number.isFinite(row.costUsd)) continue;
    totalCostUsd += row.costUsd;
    totalAssistantTurns += 1;
    if (Date.parse(row.createdAt) >= todayMs) todayCostUsd += row.costUsd;

    const sessions = byAgent.get(row.agentId) ?? new Map<string, SessionAccumulator>();
    byAgent.set(row.agentId, sessions);
    const key = row.sessionId ?? '';
    const acc = sessions.get(key) ?? { costUsd: 0, assistantTurns: 0, lastActivityAt: null };
    acc.costUsd += row.costUsd;
    acc.assistantTurns += 1;
    if (!acc.lastActivityAt || row.createdAt > acc.lastActivityAt) acc.lastActivityAt = row.createdAt;
    sessions.set(key, acc);
  }

  const agents: AgentUsage[] = [];
  for (const workspace of ctx.repos.workspaces.list()) {
    for (const agent of ctx.repos.agents.listByWorkspace(workspace.id)) {
      const sessions = byAgent.get(agent.id);
      if (!sessions) continue;
      const titleById = new Map(
        ctx.repos.sessions.listByAgent(agent.id).map((session) => [session.id, session.title]),
      );
      const sessionUsages: SessionUsage[] = [...sessions.entries()]
        .map(([sessionId, acc]) => ({
          sessionId,
          title: titleById.get(sessionId) ?? 'Deleted session',
          costUsd: round(acc.costUsd),
          assistantTurns: acc.assistantTurns,
          lastActivityAt: acc.lastActivityAt,
        }))
        .sort((a, b) => b.costUsd - a.costUsd);
      const agentTotal = sessionUsages.reduce(
        (sum, session) => ({
          costUsd: sum.costUsd + session.costUsd,
          assistantTurns: sum.assistantTurns + session.assistantTurns,
          lastActivityAt:
            session.lastActivityAt && (!sum.lastActivityAt || session.lastActivityAt > sum.lastActivityAt)
              ? session.lastActivityAt
              : sum.lastActivityAt,
        }),
        { costUsd: 0, assistantTurns: 0, lastActivityAt: null as string | null },
      );
      agents.push({
        agentId: agent.id,
        agentName: agent.name,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        archived: Boolean(agent.archivedAt),
        costUsd: round(agentTotal.costUsd),
        assistantTurns: agentTotal.assistantTurns,
        lastActivityAt: agentTotal.lastActivityAt,
        sessions: sessionUsages,
      });
    }
  }
  agents.sort((a, b) => b.costUsd - a.costUsd);

  return {
    totalCostUsd: round(totalCostUsd),
    todayCostUsd: round(todayCostUsd),
    totalAssistantTurns,
    agents,
  };
}

export async function createWorkspace(ctx: AppContext, body: CreateWorkspaceRequest) {
  const { owner, repo } = parseGitHubUrl(body.repoUrl);
  const id = uuidv4();
  const repoPath = path.join(ctx.dataDir, 'repos', id);
  await ctx.git.clone(body.repoUrl, repoPath);

  let defaultBranch = 'main';
  try {
    defaultBranch = await ctx.git.getDefaultBranch(repoPath);
  } catch {
    // fallback
  }

  const workspace = ctx.repos.workspaces.create({
    id,
    name: body.name ?? repo,
    repoUrl: body.repoUrl,
    repoPath,
    defaultBranch,
    githubOwner: owner,
    githubRepo: repo,
    createdAt: nowIso(),
  });

  notify(ctx, 'workspaces_changed');
  return workspace;
}

export async function getWorkspace(ctx: AppContext, workspaceId: string) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  return workspace;
}

export async function deleteWorkspace(ctx: AppContext, workspaceId: string) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const worktrees = ctx.repos.worktrees.listByWorkspace(workspaceId);
  for (const worktree of worktrees) {
    try {
      await deleteWorktree(ctx, worktree.id);
    } catch {
      // continue so the clone and remaining rows still get cleaned up
    }
  }

  ctx.repos.workspaces.delete(workspaceId);
  await fs.rm(workspace.repoPath, { recursive: true, force: true });
  await fs.rm(path.join(ctx.dataDir, 'worktrees', workspaceId), { recursive: true, force: true });
  notify(ctx, 'workspaces_changed');
}
