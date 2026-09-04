import type {
  Agent,
  AgentDetail,
  AgentDiffScope,
  ArchiveAgentRequest,
  ArchiveAgentResponse,
  CommitAgentChangesRequest,
  CommitAgentChangesResponse,
  CreatePrRequest,
  DeleteAgentRequest,
  DeleteAgentResponse,
  MessageAttachment,
  PruneArchivedAgentsResponse,
} from '@agent-orchestrator/shared';
import { discoverSlashCommands } from './slash-commands.js';
import { listWorktreeFiles } from './chat-mentions.js';
import { invalidateStatusCache } from './status-cache.js';
import { type AppContext, makeEvent, nowIso, notify } from './app-context.js';
import {
  clearSessionRunFields,
  createSessionForAgent,
  requireAgent,
  requireSession,
  syncAgentFromSessions,
} from './agent-core.js';
import { clearSessionQueue, drainWaitingMutatingSessions } from './chat-queue.js';
import { markStreamingAssistantStopped } from './chat-run-lifecycle.js';
import { deleteWorktree, overlayLivePullRequest } from './worktrees.js';
import { getDraftPrOfferSessionId } from './draft-pr-offer.js';
import { getTaskSuggestionsOffer } from './task-suggestions.js';
import { getInstructionDraftOffer } from './instruction-offers.js';
import { getCachedPrStatus } from './github-automation.js';

export async function getAgentDetail(ctx: AppContext, agentId: string): Promise<AgentDetail> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
  if (!worktree) throw new Error('Worktree not found');

  const workspace = ctx.repos.workspaces.getById(worktree.workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const liveWorktree = await overlayLivePullRequest(ctx, workspace, worktree);
  const sessions = ctx.repos.sessions.listByAgent(agentId);
  let activeSessionId = agent.activeSessionId;
  if (!activeSessionId || !sessions.some((item) => item.id === activeSessionId)) {
    const session = sessions[0] ?? createSessionForAgent(ctx, agent);
    activeSessionId = session.id;
    if (!sessions.some((item) => item.id === session.id)) {
      sessions.push(session);
    }
    ctx.repos.agents.update({ ...agent, activeSessionId, updatedAt: nowIso() });
  }
  return {
    ...agent,
    activeSessionId,
    worktree: liveWorktree,
    workspace,
    sessions: ctx.repos.sessions.listByAgent(agentId),
    prStatus: liveWorktree.prNumber
      ? getCachedPrStatus(ctx, workspace.githubOwner, workspace.githubRepo, liveWorktree.prNumber)
      : null,
    draftPrOffer: (() => {
      const offerSessionId = getDraftPrOfferSessionId(ctx, agentId);
      return offerSessionId ? { sessionId: offerSessionId } : null;
    })(),
    taskSuggestions: getTaskSuggestionsOffer(ctx, agentId),
    instructionDraftOffer: getInstructionDraftOffer(ctx, agentId),
  };
}

export async function stopAllSessions(ctx: AppContext, agent: Agent): Promise<void> {
  const sessions = ctx.repos.sessions.listByAgent(agent.id);
  for (const session of sessions) {
    if (session.status === 'running' || session.pid != null) {
      ctx.claude.stop(session.id, session.pid, session.runLogPath);
      ctx.repos.sessions.update(
        clearSessionRunFields(session, {
          status: session.status === 'running' ? 'idle' : session.status,
        }),
      );
      markStreamingAssistantStopped(ctx, agent.id, session.id);
    }
  }
}

export async function stopAgentSession(ctx: AppContext, agentId: string, sessionId: string) {
  const session = requireSession(ctx, agentId, sessionId);
  ctx.claude.stop(session.id, session.pid, session.runLogPath);
  markStreamingAssistantStopped(ctx, agentId, session.id);
  ctx.repos.sessions.update(
    clearSessionRunFields(session, {
      status: 'idle',
    }),
  );
  const updated = syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(makeEvent(agentId, 'session_stopped', { sessionId }));
  void drainWaitingMutatingSessions(ctx, agentId);
  return updated;
}

export async function archiveAgent(
  ctx: AppContext,
  agentId: string,
  body: ArchiveAgentRequest = {},
): Promise<ArchiveAgentResponse> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  await stopAllSessions(ctx, agent);
  for (const session of ctx.repos.sessions.listByAgent(agentId)) {
    await clearSessionQueue(ctx, session.id);
  }

  if (body.deleteWorktree) {
    await deleteWorktree(ctx, agent.worktreeId);
    invalidateStatusCache();
    return { agent: null, deletedWorktree: true };
  }
  const updated: Agent = {
    ...syncAgentFromSessions(ctx, agentId),
    status: 'archived',
    pid: null,
    runLogPath: null,
    archivedAt: nowIso(),
    updatedAt: nowIso(),
  };
  ctx.repos.agents.update(updated);
  ctx.repos.events.create(makeEvent(agentId, 'agent_archived', {}));
  notify(ctx, 'agent_changed', { agentId, data: { status: 'archived' } });
  invalidateStatusCache();
  return { agent: updated, deletedWorktree: false };
}

export async function unarchiveAgent(ctx: AppContext, agentId: string): Promise<Agent> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (!agent.archivedAt) throw new Error('Agent is not archived');
  ctx.repos.agents.update({
    ...agent,
    archivedAt: null,
    status: 'idle',
    updatedAt: nowIso(),
  });
  const updated = syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(makeEvent(agentId, 'agent_unarchived', {}));
  notify(ctx, 'agent_changed', { agentId, data: { status: updated.status } });
  return updated;
}

export async function deleteAgent(
  ctx: AppContext,
  agentId: string,
  body: DeleteAgentRequest = {},
): Promise<DeleteAgentResponse> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  await stopAllSessions(ctx, agent);
  for (const session of ctx.repos.sessions.listByAgent(agentId)) {
    await clearSessionQueue(ctx, session.id);
  }

  if (body.deleteWorktree) {
    await deleteWorktree(ctx, agent.worktreeId);
    return { deleted: true, deletedWorktree: true };
  }

  ctx.repos.agents.delete(agentId);
  notify(ctx, 'workspaces_changed');
  return { deleted: true, deletedWorktree: false };
}

/**
 * Permanently remove archived agents. Worktrees are deleted only when they
 * have no remaining active agent; otherwise only the archived agent rows go.
 */
export async function pruneArchivedAgents(ctx: AppContext): Promise<PruneArchivedAgentsResponse> {
  const archived = ctx.repos.agents.listArchived();
  let prunedAgents = 0;
  let deletedWorktrees = 0;
  const worktreeIds = [...new Set(archived.map((agent) => agent.worktreeId))];

  for (const worktreeId of worktreeIds) {
    const archivedOnTree = archived.filter((agent) => agent.worktreeId === worktreeId);
    for (const agent of archivedOnTree) {
      await stopAllSessions(ctx, agent);
    }

    const active = ctx.repos.agents.getByWorktreeId(worktreeId);
    if (active) {
      for (const agent of archivedOnTree) {
        ctx.repos.agents.delete(agent.id);
        prunedAgents += 1;
      }
      continue;
    }

    if (!ctx.repos.worktrees.getById(worktreeId)) {
      for (const agent of archivedOnTree) {
        ctx.repos.agents.delete(agent.id);
        prunedAgents += 1;
      }
      continue;
    }

    await deleteWorktree(ctx, worktreeId);
    deletedWorktrees += 1;
    prunedAgents += archivedOnTree.length;
  }

  invalidateStatusCache();
  return { prunedAgents, deletedWorktrees };
}

export function getAgentAttachment(
  ctx: AppContext,
  agentId: string,
  attachmentId: string,
): MessageAttachment {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  const attachment = ctx.repos.messages.findAttachment(agentId, attachmentId);
  if (!attachment) throw new Error('Attachment not found');
  return attachment;
}

export async function getAgentDiff(
  ctx: AppContext,
  agentId: string,
  scope: AgentDiffScope = 'pending',
) {
  const detail = await getAgentDetail(ctx, agentId);
  const path = detail.worktree.path;

  if (scope === 'pr') {
    const base = detail.worktree.baseBranch ?? detail.workspace.defaultBranch;
    try {
      const diff = await ctx.git.getDiff(path, `origin/${base}`);
      return { ...diff, path, scope };
    } catch {
      try {
        const diff = await ctx.git.getDiff(path, base);
        return { ...diff, path, scope };
      } catch {
        const diff = await ctx.git.getDiff(path);
        return { ...diff, path, scope };
      }
    }
  }

  const diff = await ctx.git.getDiff(path);
  return { ...diff, path, scope };
}

export async function listAgentSlashCommands(ctx: AppContext, agentId: string) {
  const detail = await getAgentDetail(ctx, agentId);
  return discoverSlashCommands(detail.worktree.path);
}

export async function listAgentMentionFiles(ctx: AppContext, agentId: string) {
  const detail = await getAgentDetail(ctx, agentId);
  const paths = await listWorktreeFiles(detail.worktree.path);
  return paths.map((filePath) => ({ path: filePath }));
}

export async function createAgentPullRequest(
  ctx: AppContext,
  agentId: string,
  body: CreatePrRequest,
) {
  const detail = await getAgentDetail(ctx, agentId);
  const branch = await ctx.git.getCurrentBranch(detail.worktree.path);
  const base = body.base ?? detail.worktree.baseBranch ?? detail.workspace.defaultBranch;

  const hasChanges = await ctx.git.hasChanges(detail.worktree.path);
  if (hasChanges) {
    await ctx.git.commitAll(detail.worktree.path, body.title);
  }

  await ctx.git.pushBranch(detail.worktree.path, branch);

  const pr = await ctx.github.createPullRequest(
    detail.workspace.githubOwner,
    detail.workspace.githubRepo,
    {
      title: body.title,
      body: body.body,
      head: branch,
      base,
      // Default to a draft so the idea→plan→build flow ships reviewable PRs.
      draft: body.draft ?? true,
    },
  );

  ctx.repos.worktrees.update({
    ...detail.worktree,
    prNumber: pr.number,
    prTitle: body.title,
  });

  ctx.repos.events.create(
    makeEvent(agentId, 'pr_created', { number: pr.number, htmlUrl: pr.htmlUrl }),
  );

  return pr;
}

export async function commitAgentChanges(
  ctx: AppContext,
  agentId: string,
  body: CommitAgentChangesRequest,
): Promise<CommitAgentChangesResponse> {
  const agent = requireAgent(ctx, agentId);
  if (agent.archivedAt) throw new Error('Cannot commit changes for an archived agent');

  const detail = await getAgentDetail(ctx, agentId);
  const branch = await ctx.git.getCurrentBranch(detail.worktree.path);
  const hasChanges = await ctx.git.hasChanges(detail.worktree.path);
  const shouldPush = body.push !== false;
  const message = body.message?.trim() ?? '';

  if (hasChanges) {
    if (!message) throw new Error('Commit message is required');
    await ctx.git.commitAll(detail.worktree.path, message);
  } else if (!shouldPush) {
    throw new Error('No local changes to commit');
  }

  if (shouldPush) {
    await ctx.git.pushBranch(detail.worktree.path, branch);
  }

  ctx.repos.events.create(
    makeEvent(agentId, 'changes_committed', {
      committed: hasChanges,
      pushed: shouldPush,
      branch,
    }),
  );
  notify(ctx, 'agent_changed', { agentId });
  return {
    committed: hasChanges,
    pushed: shouldPush,
    branch,
    message: hasChanges ? message : 'Pushed without a new commit',
  };
}
