import type { ChatSession, PermissionRequest } from '@agent-orchestrator/shared';
import {
  extractPlanFromInput,
  resolveAutopilotEnabled,
  shouldOfferDraftPr,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { makeEvent, notify, nowIso } from './app-context.js';
import { getAutomationSettings } from './automation-settings.js';
import { hasActiveOrQueuedTemplate } from './automation-templates.js';
import { buildApprovedPlan } from './permissions-plan.js';
import { getAgentDetail } from './agents-lifecycle.js';
import { createAgentSession } from './sessions.js';
import { enqueueChatMessage } from './chat-queue.js';
import { shouldQueueMutatingStart } from './session-mutex.js';

const CHAIN_KEY = (agentId: string) => `autopilot.chain:${agentId}`;
const OFFER_KEY = (agentId: string) => `draft-pr.offer:${agentId}`;

export function isAutopilotEnabled(ctx: AppContext, agentId: string): boolean {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent || agent.archivedAt) return false;
  return resolveAutopilotEnabled(getAutomationSettings(ctx), agent.autopilot);
}

export function hasActiveAutopilotChain(ctx: AppContext, agentId: string): boolean {
  return Boolean(ctx.repos.automationState.get(CHAIN_KEY(agentId)));
}

export function beginAutopilotChain(ctx: AppContext, agentId: string, phase: 'build' | 'draft-pr'): void {
  ctx.repos.automationState.set(
    CHAIN_KEY(agentId),
    JSON.stringify({ phase, startedAt: nowIso() }),
  );
}

export function clearAutopilotChain(ctx: AppContext, agentId: string): void {
  ctx.repos.automationState.delete(CHAIN_KEY(agentId));
}

export function getDraftPrOfferSessionId(ctx: AppContext, agentId: string): string | null {
  return ctx.repos.automationState.get(OFFER_KEY(agentId));
}

export function setDraftPrOffer(ctx: AppContext, agentId: string, sessionId: string): void {
  ctx.repos.automationState.set(OFFER_KEY(agentId), sessionId);
}

export function clearDraftPrOffer(ctx: AppContext, agentId: string): void {
  ctx.repos.automationState.delete(OFFER_KEY(agentId));
}

function emitAutopilot(
  ctx: AppContext,
  agentId: string,
  action: string,
  data: Record<string, unknown> = {},
): void {
  notify(ctx, 'automation_triggered', {
    agentId,
    data: { action, ...data },
  });
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

/** Start create-draft-pr (or queue behind the worktree lock). */
export async function startCreateDraftPrSession(
  ctx: AppContext,
  agentId: string,
): Promise<ChatSession | null> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent || agent.archivedAt) return null;
  if (hasActiveOrQueuedTemplate(ctx, agentId, 'create-draft-pr')) return null;

  const { session, kickoffPrompt } = await createAgentSession(ctx, agentId, {
    template: 'create-draft-pr',
  });
  if (!kickoffPrompt) return session;

  const sessions = ctx.repos.sessions.listByAgent(agentId);
  if (shouldQueueMutatingStart(sessions, session)) {
    await enqueueChatMessage(ctx, agentId, session.id, { message: kickoffPrompt }, { drain: true });
    return session;
  }

  const { streamAgentChat } = await import('./chat-stream.js');
  void streamAgentChat(ctx, agentId, { message: kickoffPrompt }, null, session.id, {
    createdSession: session,
  });
  return session;
}

export async function maybeAutopilotOnExitPlanMode(
  ctx: AppContext,
  agentId: string,
  session: ChatSession,
  request: PermissionRequest,
): Promise<void> {
  if (request.toolName !== 'ExitPlanMode') return;
  if (session.permissionMode !== 'plan') return;
  if (!isAutopilotEnabled(ctx, agentId)) return;
  if (hasActiveAutopilotChain(ctx, agentId)) {
    emitAutopilot(ctx, agentId, 'autopilot_blocked', {
      reason: 'chain_active',
      sessionId: session.id,
    });
    return;
  }
  if (hasActiveOrQueuedTemplate(ctx, agentId, 'build')) {
    emitAutopilot(ctx, agentId, 'autopilot_blocked', {
      reason: 'build_active',
      sessionId: session.id,
    });
    return;
  }

  beginAutopilotChain(ctx, agentId, 'build');
  const plan = extractPlanFromInput(request.input) || undefined;
  try {
    emitAutopilot(ctx, agentId, 'autopilot_build_started', {
      sessionId: session.id,
      requestId: request.requestId,
    });
    await buildApprovedPlan(
      ctx,
      agentId,
      { requestId: request.requestId, plan },
      null,
      session.id,
    );
  } catch (error) {
    clearAutopilotChain(ctx, agentId);
    emitAutopilot(ctx, agentId, 'autopilot_blocked', {
      reason: 'build_failed',
      sessionId: session.id,
      message: error instanceof Error ? error.message : 'Build failed',
    });
  }
}

export async function maybeAutopilotAfterBuild(
  ctx: AppContext,
  session: ChatSession,
  outcome: { stopped?: boolean; error?: string | null },
): Promise<void> {
  if (session.template !== 'build') return;

  const { eligible, hasDiff, hasOpenPr } = await evaluateDraftPrConditions(
    ctx,
    session.agentId,
    session,
    outcome,
  );

  if (!eligible) {
    if (hasActiveAutopilotChain(ctx, session.agentId)) {
      clearAutopilotChain(ctx, session.agentId);
      if (outcome.stopped || outcome.error) {
        emitAutopilot(ctx, session.agentId, 'autopilot_blocked', {
          reason: outcome.error ? 'build_failed' : 'build_stopped',
          sessionId: session.id,
          message: outcome.error ?? null,
        });
      } else if (!hasDiff) {
        emitAutopilot(ctx, session.agentId, 'autopilot_blocked', {
          reason: 'no_diff',
          sessionId: session.id,
        });
      } else if (hasOpenPr) {
        emitAutopilot(ctx, session.agentId, 'autopilot_blocked', {
          reason: 'pr_exists',
          sessionId: session.id,
        });
      }
    }
    return;
  }

  if (isAutopilotEnabled(ctx, session.agentId)) {
    beginAutopilotChain(ctx, session.agentId, 'draft-pr');
    clearDraftPrOffer(ctx, session.agentId);
    const started = await startCreateDraftPrSession(ctx, session.agentId);
    if (!started) {
      clearAutopilotChain(ctx, session.agentId);
      emitAutopilot(ctx, session.agentId, 'autopilot_blocked', {
        reason: 'draft_pr_active',
        sessionId: session.id,
      });
      return;
    }
    emitAutopilot(ctx, session.agentId, 'autopilot_draft_pr_started', {
      sessionId: session.id,
      draftPrSessionId: started.id,
    });
    return;
  }

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

export function markAutopilotBuildHandoff(ctx: AppContext, agentId: string): void {
  if (!isAutopilotEnabled(ctx, agentId)) return;
  if (hasActiveAutopilotChain(ctx, agentId)) return;
  beginAutopilotChain(ctx, agentId, 'build');
}

export function onCreateDraftPrSessionStarted(ctx: AppContext, agentId: string): void {
  clearDraftPrOffer(ctx, agentId);
  clearAutopilotChain(ctx, agentId);
}
