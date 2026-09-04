import { v4 as uuidv4 } from 'uuid';
import {
  buildStatusTaskSuggestionDrafts,
  mergeTaskSuggestionDrafts,
  toTaskSuggestions,
  type ChatSession,
  type TaskSuggestion,
  type TaskSuggestionChangeStatus,
  type TaskSuggestionDraft,
  type TaskSuggestionsOffer,
} from '@agent-orchestrator/shared';
import { type AppContext, makeEvent, notify } from './app-context.js';
import { extractJsonObject } from './extract-json-object.js';
import { getCachedPrStatus } from './pr-status-cache.js';

const OFFER_KEY = (agentId: string) => `task-suggestions.offer:${agentId}`;
const MAX_LLM_SUGGESTIONS = 4;
const MAX_TOTAL_SUGGESTIONS = 6;

export interface TaskSuggestionsContext {
  sessionTitle: string;
  lastAssistantMessage: string;
}

export function buildTaskSuggestionsPrompt(context: TaskSuggestionsContext): {
  system: string;
  user: string;
} {
  const system = [
    'You read the final reply from a coding-agent chat session and propose concrete follow-up tasks.',
    'Call the submit_task_suggestions tool with 1 to 4 suggestions.',
    'If you cannot call a tool, respond with ONLY a JSON object {"suggestions": [...]} (no markdown fences or extra text).',
    'Each suggestion is {"title":"...","prompt":"..."}.',
    '"title" is a short label, 3-6 words, no trailing punctuation.',
    '"prompt" is a ready-to-send follow-up message for the same chat that continues the work, written as if the user were asking for it directly.',
    'Base suggestions only on what the final reply says was done, found, or left open. Do not invent unrelated work.',
    'Prefer concrete, actionable next steps (e.g. add tests, fix a mentioned issue, extend to another file) over vague ideas.',
    'Do not suggest committing, pushing, creating a pull request, fixing CI, addressing review, or resolving conflicts — the app adds those from git/PR status.',
  ].join(' ');

  const user = [
    `Session: ${context.sessionTitle}`,
    'Final assistant reply:',
    context.lastAssistantMessage || '(empty)',
  ].join('\n\n');

  return { system, user };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Parse LLM JSON into drafts (no ids). Empty list when nothing valid. */
export function parseTaskSuggestionDrafts(raw: unknown): TaskSuggestionDraft[] {
  const parsed = extractJsonObject(raw, 'Task suggestions response');
  const items = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

  const drafts: TaskSuggestionDraft[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const title = asString(row.title);
    const prompt = asString(row.prompt);
    if (!title || !prompt) continue;
    drafts.push({ title, prompt, kind: 'prompt' });
    if (drafts.length >= MAX_LLM_SUGGESTIONS) break;
  }
  return drafts;
}

/** @deprecated Prefer parseTaskSuggestionDrafts + merge; kept for Anthropic tool parsing. */
export function parseTaskSuggestionsResponse(raw: unknown): TaskSuggestion[] {
  return toTaskSuggestions(parseTaskSuggestionDrafts(raw), () => uuidv4());
}

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
      return false;
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

/**
 * After any session finishes cleanly, offer follow-ups: status chips (Commit and Push,
 * Create PR, …) plus LLM prompts from the final reply. Always persists an offer.
 */
export async function maybeSuggestFollowUpTasks(
  ctx: AppContext,
  session: ChatSession,
  outcome: { stopped?: boolean; error?: string | null },
): Promise<void> {
  if (outcome.stopped || outcome.error) return;

  const changeStatus = await gatherTaskSuggestionChangeStatus(ctx, session.agentId);
  const statusDrafts = buildStatusTaskSuggestionDrafts(changeStatus);

  const messages = ctx.repos.messages.listBySession(session.id);
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  let llmDrafts: TaskSuggestionDraft[] = [];
  if (lastAssistant?.content.trim()) {
    try {
      const suggestions = await ctx.anthropic.generateTaskSuggestions({
        lastAssistantMessage: lastAssistant.content,
        sessionTitle: session.title ?? 'Chat',
      });
      llmDrafts = suggestions.map((s) => ({
        title: s.title,
        prompt: s.prompt,
        kind: s.kind ?? 'prompt',
        template: s.template,
      }));
    } catch (error) {
      console.warn(`[task-suggestions] LLM suggestions failed for session ${session.id}:`, error);
    }
  }

  const drafts = mergeTaskSuggestionDrafts(statusDrafts, llmDrafts, MAX_TOTAL_SUGGESTIONS);
  const suggestions = toTaskSuggestions(drafts, () => uuidv4());
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
