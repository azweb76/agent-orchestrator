import { v4 as uuidv4 } from 'uuid';
import {
  buildStatusTaskSuggestionDrafts,
  filterApplicableTaskFollowUps,
  mergeTaskSuggestionDrafts,
  resolveAgentDeliveryPhase,
  type ChatSession,
  type TaskFollowUp,
  type TaskSuggestion,
  type TaskSuggestionChangeStatus,
  type TaskSuggestionsOffer,
} from '@agent-orchestrator/shared';
import { type AppContext, makeEvent, notify } from './app-context.js';
import { getCachedPrStatus } from './pr-status-cache.js';
import {
  followUpToSuggestion,
  mapFollowUpIdsToSuggestions,
  type TaskSuggestionsContext,
} from './task-suggestions-select.js';
import { ensureBuiltInTaskFollowUps, listEnabledTaskFollowUps } from './task-followups.js';

export {
  buildTaskSuggestionsPrompt,
  followUpToSuggestion,
  mapFollowUpIdsToSuggestions,
  parseTaskFollowUpSelection,
  parseTaskSuggestionDrafts,
  parseTaskSuggestionsResponse,
  type TaskFollowUpCatalogItem,
  type TaskSuggestionsAgentSnapshot,
  type TaskSuggestionsContext,
} from './task-suggestions-select.js';

const OFFER_KEY = (agentId: string) => `task-suggestions.offer:${agentId}`;
const MAX_TOTAL_SUGGESTIONS = 6;
const MAX_ASSISTANT_MESSAGES = 5;
const MAX_MESSAGE_CHARS = 2000;

export function getTaskSuggestionsOffer(ctx: AppContext, agentId: string): TaskSuggestionsOffer | null {
  const raw = ctx.repos.automationState.get(OFFER_KEY(agentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TaskSuggestionsOffer;
  } catch {
    return null;
  }
}

export function setTaskSuggestionsOffer(
  ctx: AppContext,
  agentId: string,
  offer: TaskSuggestionsOffer,
): void {
  ctx.repos.automationState.set(OFFER_KEY(agentId), JSON.stringify(offer));
}

export function clearTaskSuggestionsOffer(ctx: AppContext, agentId: string): void {
  ctx.repos.automationState.delete(OFFER_KEY(agentId));
}

async function branchHasOpenPr(
  ctx: AppContext,
  workspace: { githubOwner: string; githubRepo: string },
  worktree: { branch: string; prNumber: number | null },
): Promise<boolean> {
  if (worktree.prNumber != null) return true;
  if (!process.env.GITHUB_TOKEN) return false;
  try {
    const pr = await ctx.github.getPullRequestForBranch(
      workspace.githubOwner,
      workspace.githubRepo,
      worktree.branch,
    );
    return pr?.state === 'open';
  } catch {
    return false;
  }
}

async function worktreeHasBranchDiff(
  ctx: AppContext,
  worktreePath: string,
  baseBranch: string,
): Promise<boolean> {
  for (const ref of [`origin/${baseBranch}`, baseBranch] as const) {
    try {
      const diff = await ctx.git.getDiff(worktreePath, ref);
      if (diff.stat.trim() || diff.patch.trim()) return true;
    } catch {
      // try commits-ahead / next ref
    }
    try {
      if (await ctx.git.hasCommitsAhead(worktreePath, ref)) return true;
    } catch {
      // try next ref
    }
  }
  const pending = await ctx.git.getDiff(worktreePath);
  return Boolean(pending.stat.trim() || pending.patch.trim());
}

export async function gatherTaskSuggestionChangeStatus(
  ctx: AppContext,
  agentId: string,
): Promise<TaskSuggestionChangeStatus> {
  const empty: TaskSuggestionChangeStatus = {
    hasPendingChanges: false,
    hasBranchDiff: false,
    hasOpenPr: false,
  };
  try {
    const agent = ctx.repos.agents.getById(agentId);
    if (!agent) return empty;
    const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
    if (!worktree) return empty;
    const workspace = ctx.repos.workspaces.getById(worktree.workspaceId);
    if (!workspace) return empty;

    const hasPendingChanges = await ctx.git.hasChanges(worktree.path);
    const base = worktree.baseBranch ?? workspace.defaultBranch;
    const hasBranchDiff =
      hasPendingChanges || (await worktreeHasBranchDiff(ctx, worktree.path, base));
    const hasOpenPr = await branchHasOpenPr(ctx, workspace, worktree);
    const pr =
      worktree.prNumber != null
        ? getCachedPrStatus(ctx, workspace.githubOwner, workspace.githubRepo, worktree.prNumber)
        : null;

    return { hasPendingChanges, hasBranchDiff, hasOpenPr, pr };
  } catch (error) {
    console.warn(`[task-suggestions] change-status probe failed for agent ${agentId}:`, error);
    return empty;
  }
}

function clipMessage(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_MESSAGE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_MESSAGE_CHARS)}…`;
}

export function recentAssistantMessagesFromSession(
  ctx: AppContext,
  sessionId: string,
  limit = MAX_ASSISTANT_MESSAGES,
): string[] {
  const messages = ctx.repos.messages.listBySession(sessionId);
  return messages
    .filter((m) => m.role === 'assistant' && m.content.trim())
    .slice(-limit)
    .map((m) => clipMessage(m.content));
}

function fallbackSuggestions(
  changeStatus: TaskSuggestionChangeStatus,
  catalog: readonly TaskFollowUp[],
): TaskSuggestion[] {
  const statusDrafts = buildStatusTaskSuggestionDrafts(changeStatus);
  const drafts = mergeTaskSuggestionDrafts(statusDrafts, [], MAX_TOTAL_SUGGESTIONS);
  const byTitle = new Map(catalog.map((item) => [item.title.toLowerCase(), item]));
  const mapped: TaskSuggestion[] = [];
  for (const draft of drafts) {
    const match = byTitle.get(draft.title.toLowerCase());
    if (match) {
      mapped.push(followUpToSuggestion(match));
    } else {
      mapped.push({
        id: uuidv4(),
        title: draft.title,
        description: draft.description,
        prompt: draft.prompt,
        kind: draft.kind ?? 'prompt',
        template: draft.template,
      });
    }
  }
  return mapped;
}

function buildSelectionContext(
  ctx: AppContext,
  session: ChatSession,
  changeStatus: TaskSuggestionChangeStatus,
  applicableCatalog: readonly TaskFollowUp[],
): TaskSuggestionsContext | null {
  const agent = ctx.repos.agents.getById(session.agentId);
  if (!agent) return null;
  const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
  if (!worktree) return null;
  const workspace = ctx.repos.workspaces.getById(worktree.workspaceId);
  if (!workspace) return null;

  const sessions = ctx.repos.sessions.listByAgent(session.agentId);
  const deliveryPhase = resolveAgentDeliveryPhase({
    archived: Boolean(agent.archivedAt),
    agentStatus: agent.status,
    sessions,
    hasLinkedPr: worktree.prNumber != null,
    pr:
      changeStatus.pr && worktree.prNumber != null
        ? {
            state: 'open',
            merged: false,
            draft: false,
            reviewCommentCount: changeStatus.pr.reviewCommentCount ?? 0,
            mergeableState: changeStatus.pr.mergeableState ?? 'unknown',
            mergeable: changeStatus.pr.mergeable ?? null,
          }
        : null,
    checks: changeStatus.pr
      ? {
          rollup: changeStatus.pr.checksRollup ?? 'none',
          failing: changeStatus.pr.checksFailing ?? 0,
        }
      : null,
  });

  return {
    agent: {
      agentName: agent.name,
      agentStatus: agent.status,
      model: agent.model,
      effort: agent.effort,
      permissionMode: agent.permissionMode,
      sessionTitle: session.title ?? 'Chat',
      sessionTemplate: session.template,
      sessionPermissionMode: session.permissionMode,
      branch: worktree.branch,
      baseBranch: worktree.baseBranch ?? workspace.defaultBranch,
      prNumber: worktree.prNumber,
      githubOwner: workspace.githubOwner,
      githubRepo: workspace.githubRepo,
      deliveryPhase,
      changeStatus,
    },
    catalog: applicableCatalog.map((item) => ({
      id: item.id,
      name: item.name,
      title: item.title,
      description: item.description,
      prompt: item.prompt,
      kind: item.kind,
      template: item.template,
    })),
    recentAssistantMessages: recentAssistantMessagesFromSession(ctx, session.id),
  };
}

/**
 * After any session finishes cleanly, ask AI to pick follow-ups from the
 * user-managed catalog using agent context + recent assistant messages.
 */
export async function maybeSuggestFollowUpTasks(
  ctx: AppContext,
  session: ChatSession,
  outcome: { stopped?: boolean; error?: string | null },
): Promise<void> {
  if (outcome.stopped || outcome.error) return;

  ensureBuiltInTaskFollowUps(ctx);
  const changeStatus = await gatherTaskSuggestionChangeStatus(ctx, session.agentId);
  const catalog = listEnabledTaskFollowUps(ctx);
  const applicableCatalog = filterApplicableTaskFollowUps(catalog, changeStatus);

  let suggestions: TaskSuggestion[] = [];
  const selectionContext = buildSelectionContext(ctx, session, changeStatus, applicableCatalog);
  if (
    selectionContext &&
    applicableCatalog.length > 0 &&
    typeof ctx.anthropic.selectTaskFollowUps === 'function'
  ) {
    try {
      const selectedIds = await ctx.anthropic.selectTaskFollowUps(selectionContext);
      suggestions = mapFollowUpIdsToSuggestions(selectedIds, applicableCatalog, changeStatus);
    } catch (error) {
      console.warn(`[task-suggestions] LLM selection failed for session ${session.id}:`, error);
    }
  }

  if (suggestions.length === 0) {
    suggestions = fallbackSuggestions(changeStatus, catalog);
  }

  const offer: TaskSuggestionsOffer = { sessionId: session.id, suggestions };
  setTaskSuggestionsOffer(ctx, session.agentId, offer);
  ctx.repos.events.create(
    makeEvent(session.agentId, 'task_suggestions_offered', { sessionId: session.id }),
  );
  notify(ctx, 'task_suggestions_offer', {
    agentId: session.agentId,
    sessionId: session.id,
    data: { suggestionCount: suggestions.length },
  });
}
