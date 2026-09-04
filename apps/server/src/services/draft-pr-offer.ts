import type { ChatSession } from '@agent-orchestrator/shared';
import { shouldOfferDraftPr } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { makeEvent, notify } from './app-context.js';
import { getAgentDetail } from './agents-lifecycle.js';

const OFFER_KEY = (agentId: string) => `draft-pr.offer:${agentId}`;

export function getDraftPrOfferSessionId(ctx: AppContext, agentId: string): string | null {
  return ctx.repos.automationState.get(OFFER_KEY(agentId));
}

export function setDraftPrOffer(ctx: AppContext, agentId: string, sessionId: string): void {
  ctx.repos.automationState.set(OFFER_KEY(agentId), sessionId);
}

export function clearDraftPrOffer(ctx: AppContext, agentId: string): void {
  ctx.repos.automationState.delete(OFFER_KEY(agentId));
}

async function branchHasOpenPr(ctx: AppContext, agentId: string): Promise<boolean> {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.worktree.prNumber != null) return true;
  if (!process.env.GITHUB_TOKEN) return false;
  try {
    const pr = await ctx.github.getPullRequestForBranch(
      detail.workspace.githubOwner,
      detail.workspace.githubRepo,
      detail.worktree.branch,
    );
    return pr?.state === 'open';
  } catch {
    return false;
  }
}

async function worktreeHasDiff(ctx: AppContext, agentId: string): Promise<boolean> {
  const detail = await getAgentDetail(ctx, agentId);
  const diff = await ctx.git.getDiff(detail.worktree.path);
  return Boolean(diff.stat.trim() || diff.patch.trim());
}

export async function evaluateDraftPrConditions(
  ctx: AppContext,
  agentId: string,
  session: Pick<ChatSession, 'id' | 'template' | 'status'>,
  outcome: { stopped?: boolean; error?: string | null },
): Promise<{ eligible: boolean; hasDiff: boolean; hasOpenPr: boolean }> {
  const hasDiff = await worktreeHasDiff(ctx, agentId);
  const hasOpenPr = await branchHasOpenPr(ctx, agentId);
  const eligible = shouldOfferDraftPr({
    template: session.template,
    status: session.status,
    stopped: outcome.stopped,
    error: outcome.error,
    hasDiff,
    hasOpenPr,
  });
  return { eligible, hasDiff, hasOpenPr };
}

/** After a successful Build with a diff and no open PR, store a one-click draft-PR offer. */
export async function maybeOfferDraftPrAfterBuild(
  ctx: AppContext,
  session: ChatSession,
  outcome: { stopped?: boolean; error?: string | null },
): Promise<void> {
  if (session.template !== 'build') return;

  const { eligible } = await evaluateDraftPrConditions(ctx, session.agentId, session, outcome);
  if (!eligible) return;

  setDraftPrOffer(ctx, session.agentId, session.id);
  ctx.repos.events.create(
    makeEvent(session.agentId, 'draft_pr_offered', { sessionId: session.id }),
  );
  notify(ctx, 'draft_pr_offer', {
    agentId: session.agentId,
    sessionId: session.id,
    data: { buildSessionId: session.id },
  });
}

export function onCreateDraftPrSessionStarted(ctx: AppContext, agentId: string): void {
  clearDraftPrOffer(ctx, agentId);
}
