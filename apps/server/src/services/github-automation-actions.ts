import { FIX_CI_RETRY_CAP } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { notify } from './app-context.js';
import { archiveAgent } from './agents-lifecycle.js';
import {
  formatPollAddressReviewStarted,
  formatPollFixCiCapHit,
  formatPollFixCiStarted,
  postAutomationAuditToAssistant,
} from './assistant-automation-audit.js';
import { getAutomationSettings } from './automation-settings.js';
import { hasActiveOrQueuedTemplate, startAutomationTemplate } from './automation-templates.js';
import type { GithubPrChangeEvent } from './github-automation.js';
import type { PollTarget } from './github-poll-targets.js';
import { pollTargetKey } from './github-poll-targets.js';

function fixCiAttemptsKey(agentId: string, headSha: string): string {
  return `fix-ci:${agentId}:${headSha}`;
}

function archivedStateKey(target: PollTarget): string {
  return `archived:${pollTargetKey(target)}`;
}

function emitAutomation(
  ctx: AppContext,
  agentId: string,
  action: string,
  data: Record<string, unknown>,
): void {
  notify(ctx, 'automation_triggered', {
    agentId,
    data: { action, ...data },
  });
}

export async function handleAutomationEvents(
  ctx: AppContext,
  target: PollTarget,
  events: GithubPrChangeEvent[],
): Promise<void> {
  const settings = getAutomationSettings(ctx);
  if (!target.agentId) return;

  const agent = ctx.repos.agents.getById(target.agentId);
  if (!agent || agent.archivedAt) return;

  for (const event of events) {
    if (event.kind === 'checks' && settings.autoFixCi && event.checksRollup === 'failure') {
      await maybeAutoFixCi(ctx, target, event);
    }
    if (event.kind === 'reviews' && settings.autoAddressReview) {
      await maybeAutoAddressReview(ctx, target, event);
    }
    if (event.kind === 'merged' && settings.autoArchiveOnMerge) {
      await maybeAutoArchive(ctx, target, settings);
    }
  }
}

async function maybeAutoFixCi(
  ctx: AppContext,
  target: PollTarget,
  event: GithubPrChangeEvent,
): Promise<void> {
  if (!target.agentId || !event.headSha) return;
  if (!target.authored && !target.worktreeId) return;
  if (hasActiveOrQueuedTemplate(ctx, target.agentId, 'fix-ci')) return;

  const attemptsKey = fixCiAttemptsKey(target.agentId, event.headSha);
  const attempts = ctx.repos.automationState.getNumber(attemptsKey);
  if (attempts >= FIX_CI_RETRY_CAP) {
    emitAutomation(ctx, target.agentId, 'fix_ci_cap_hit', {
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      headSha: event.headSha,
      attempts,
      cap: FIX_CI_RETRY_CAP,
    });
    postAutomationAuditToAssistant(
      ctx,
      formatPollFixCiCapHit({
        owner: target.owner,
        repo: target.repo,
        number: target.number,
        agentId: target.agentId,
        attempts,
        cap: FIX_CI_RETRY_CAP,
      }),
    );
    return;
  }

  const session = await startAutomationTemplate(ctx, target.agentId, 'fix-ci');
  if (!session) return;

  ctx.repos.automationState.increment(attemptsKey);
  emitAutomation(ctx, target.agentId, 'fix_ci_started', {
    owner: target.owner,
    repo: target.repo,
    number: target.number,
    headSha: event.headSha,
    sessionId: session.id,
    attempt: attempts + 1,
  });
  postAutomationAuditToAssistant(
    ctx,
    formatPollFixCiStarted({
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      agentId: target.agentId,
      sessionId: session.id,
      attempt: attempts + 1,
    }),
  );
}

async function maybeAutoAddressReview(
  ctx: AppContext,
  target: PollTarget,
  event: GithubPrChangeEvent,
): Promise<void> {
  if (!target.agentId) return;
  const hasNew =
    (event.reviewIds?.length ?? 0) > 0 ||
    (event.commentIds?.length ?? 0) > 0 ||
    target.reviewRequested;
  if (!hasNew) return;

  const session = await startAutomationTemplate(ctx, target.agentId, 'address-review');
  if (!session) {
    if (hasActiveOrQueuedTemplate(ctx, target.agentId, 'address-review')) return;
    emitAutomation(ctx, target.agentId, 'address_review_blocked', {
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      reason: 'worktree_busy',
    });
    return;
  }

  emitAutomation(ctx, target.agentId, 'address_review_started', {
    owner: target.owner,
    repo: target.repo,
    number: target.number,
    sessionId: session.id,
  });
  postAutomationAuditToAssistant(
    ctx,
    formatPollAddressReviewStarted({
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      agentId: target.agentId,
      sessionId: session.id,
    }),
  );
}

async function maybeAutoArchive(
  ctx: AppContext,
  target: PollTarget,
  settings: ReturnType<typeof getAutomationSettings>,
): Promise<void> {
  if (!target.agentId || !target.worktreeId) return;

  const worktree = ctx.repos.worktrees.getById(target.worktreeId);
  if (!worktree?.prNumber) {
    emitAutomation(ctx, target.agentId, 'archive_skipped', {
      reason: 'no_linked_pr',
      owner: target.owner,
      repo: target.repo,
      number: target.number,
    });
    return;
  }

  const dirty = await ctx.git.hasChanges(worktree.path);
  if (dirty && !settings.autoArchiveAllowDirty) {
    emitAutomation(ctx, target.agentId, 'archive_skipped', {
      reason: 'dirty_worktree',
      owner: target.owner,
      repo: target.repo,
      number: target.number,
    });
    return;
  }

  await archiveAgent(ctx, target.agentId, {
    deleteWorktree: settings.autoArchiveDeleteWorktree,
  });
  ctx.repos.automationState.set(archivedStateKey(target), '1');
  emitAutomation(ctx, target.agentId, 'archive_completed', {
    owner: target.owner,
    repo: target.repo,
    number: target.number,
    deletedWorktree: settings.autoArchiveDeleteWorktree,
  });
}
