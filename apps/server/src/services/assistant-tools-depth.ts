import { z } from 'zod';
import type { AutomationSettings } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import type { AssistantToolExecution } from './assistant-tools.js';
import {
  createAgentMemory,
  listAgentMemories,
  updateAgentMemory,
} from './agent-memory.js';
import { createAgentPullRequest } from './agents-lifecycle.js';
import { getAutomationSettings, setAutomationSettings } from './automation-settings.js';
import { triggerGithubPollNow } from './github-poll-bus.js';
import { getPullRequestChecks, getPullRequestDetail } from './pull-requests.js';
import { getUsageSummary } from './workspaces.js';

type ConfirmFn = (confirm: boolean | undefined, toolName: string) => void;

const getPrSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
  includeChecks: z.boolean().optional(),
});

export async function handleGetPullRequest(
  ctx: AppContext,
  input: Record<string, unknown>,
): Promise<AssistantToolExecution> {
  const body = getPrSchema.parse(input);
  const detail = await getPullRequestDetail(ctx, body.owner, body.repo, body.number);
  const payload: Record<string, unknown> = {
    owner: body.owner,
    repo: body.repo,
    number: detail.number,
    title: detail.title,
    state: detail.state,
    draft: detail.draft,
    merged: detail.merged,
    mergeable: detail.mergeable,
    mergeableState: detail.mergeableState,
    htmlUrl: detail.htmlUrl,
    headRef: detail.headRef,
    headSha: detail.headSha,
    baseRef: detail.baseRef,
    reviewCommentCount: detail.reviewCommentCount,
    agentId: detail.agentId ?? null,
  };
  if (body.includeChecks) {
    const checks = await getPullRequestChecks(ctx, body.owner, body.repo, body.number);
    payload.checks = {
      rollup: checks.rollup,
      failing: checks.failing,
      total: checks.total,
    };
  }
  return { content: JSON.stringify(payload) };
}

const createPrSchema = z.object({
  agentId: z.string().min(1),
  title: z.string().min(1).max(256),
  body: z.string().max(20_000).optional(),
  base: z.string().min(1).max(256).optional(),
  draft: z.boolean().optional(),
  confirm: z.boolean(),
});

export async function handleCreateAgentPullRequest(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<AssistantToolExecution> {
  const body = createPrSchema.parse(input);
  requireConfirm(body.confirm, 'create_agent_pull_request');
  const draft = body.draft ?? true;
  const pr = await createAgentPullRequest(ctx, body.agentId, {
    title: body.title,
    body: body.body,
    base: body.base,
    draft,
  });
  const navigateTo = `/agents/${body.agentId}`;
  return {
    content: JSON.stringify({
      ok: true,
      agentId: body.agentId,
      number: pr.number,
      htmlUrl: pr.htmlUrl,
      draft,
      navigateTo,
    }),
    navigateTo,
    agentId: body.agentId,
  };
}

export function handleListAgentMemories(
  ctx: AppContext,
  input: Record<string, unknown>,
): AssistantToolExecution {
  const agentId = z.string().min(1).parse(input.agentId);
  const includeArchived = input.includeArchived === true;
  const memories = listAgentMemories(ctx, agentId).filter(
    (item) => includeArchived || item.status === 'active',
  );
  return {
    content: JSON.stringify(
      memories.map((item) => ({
        id: item.id,
        scope: item.scope,
        kind: item.kind,
        key: item.key,
        content: item.content,
        status: item.status,
        workspaceId: item.workspaceId,
        agentId: item.agentId,
        updatedAt: item.updatedAt,
      })),
    ),
  };
}

const createMemorySchema = z.object({
  agentId: z.string().min(1),
  scope: z.enum(['global', 'workspace', 'agent']),
  key: z.string().min(1).max(120),
  content: z.string().min(1).max(4000),
  kind: z.enum(['preference', 'lesson', 'fact']).optional(),
  confirm: z.boolean(),
});

export function handleCreateAgentMemory(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): AssistantToolExecution {
  const body = createMemorySchema.parse(input);
  requireConfirm(body.confirm, 'create_agent_memory');
  const memory = createAgentMemory(ctx, body.agentId, {
    scope: body.scope,
    key: body.key,
    content: body.content,
    kind: body.kind,
  });
  return {
    content: JSON.stringify({
      ok: true,
      memory: {
        id: memory.id,
        scope: memory.scope,
        kind: memory.kind,
        key: memory.key,
        content: memory.content,
        status: memory.status,
      },
    }),
  };
}

const updateMemorySchema = z.object({
  agentId: z.string().min(1),
  memoryId: z.string().min(1),
  content: z.string().min(1).max(4000).optional(),
  kind: z.enum(['preference', 'lesson', 'fact']).optional(),
  key: z.string().min(1).max(120).optional(),
  status: z.enum(['active', 'archived']).optional(),
  confirm: z.boolean(),
});

export function handleUpdateAgentMemory(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): AssistantToolExecution {
  const body = updateMemorySchema.parse(input);
  requireConfirm(body.confirm, 'update_agent_memory');
  const memory = updateAgentMemory(ctx, body.agentId, body.memoryId, {
    content: body.content,
    kind: body.kind,
    key: body.key,
    status: body.status,
  });
  return {
    content: JSON.stringify({
      ok: true,
      memory: {
        id: memory.id,
        scope: memory.scope,
        kind: memory.kind,
        key: memory.key,
        content: memory.content,
        status: memory.status,
      },
    }),
  };
}

export function handleGetUsageSummary(
  ctx: AppContext,
  input: Record<string, unknown>,
): AssistantToolExecution {
  const topAgents =
    typeof input.topAgents === 'number' && Number.isFinite(input.topAgents)
      ? Math.min(20, Math.max(1, Math.floor(input.topAgents)))
      : 8;
  const summary = getUsageSummary(ctx);
  return {
    content: JSON.stringify({
      totalCostUsd: summary.totalCostUsd,
      todayCostUsd: summary.todayCostUsd,
      totalAssistantTurns: summary.totalAssistantTurns,
      budget: summary.budget,
      agents: summary.agents.slice(0, topAgents).map((agent) => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        workspaceName: agent.workspaceName,
        costUsd: agent.costUsd,
        assistantTurns: agent.assistantTurns,
        archived: agent.archived,
      })),
    }),
  };
}

export function handleGetAutomationSettings(ctx: AppContext): AssistantToolExecution {
  return { content: JSON.stringify(getAutomationSettings(ctx)) };
}

const setAutomationSchema = z.object({
  enabled: z.boolean().optional(),
  pollIntervalSeconds: z.number().int().optional(),
  autoFixCi: z.boolean().optional(),
  autoAddressReview: z.boolean().optional(),
  autoArchiveOnMerge: z.boolean().optional(),
  autoArchiveDeleteWorktree: z.boolean().optional(),
  autoArchiveAllowDirty: z.boolean().optional(),
  confirm: z.boolean(),
});

export function handleSetAutomationSettings(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): AssistantToolExecution {
  const body = setAutomationSchema.parse(input);
  requireConfirm(body.confirm, 'set_automation_settings');
  const patch: Partial<AutomationSettings> = {};
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.pollIntervalSeconds !== undefined) patch.pollIntervalSeconds = body.pollIntervalSeconds;
  if (body.autoFixCi !== undefined) patch.autoFixCi = body.autoFixCi;
  if (body.autoAddressReview !== undefined) patch.autoAddressReview = body.autoAddressReview;
  if (body.autoArchiveOnMerge !== undefined) patch.autoArchiveOnMerge = body.autoArchiveOnMerge;
  if (body.autoArchiveDeleteWorktree !== undefined) {
    patch.autoArchiveDeleteWorktree = body.autoArchiveDeleteWorktree;
  }
  if (body.autoArchiveAllowDirty !== undefined) patch.autoArchiveAllowDirty = body.autoArchiveAllowDirty;
  if (Object.keys(patch).length === 0) {
    throw new Error('Provide at least one automation setting field to update');
  }
  const settings = setAutomationSettings(ctx, patch);
  return { content: JSON.stringify({ ok: true, settings }) };
}

export async function handleTriggerAutomationPoll(
  ctx: AppContext,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<AssistantToolExecution> {
  requireConfirm(input.confirm === true, 'trigger_automation_poll');
  const result = await triggerGithubPollNow(ctx);
  return {
    content: JSON.stringify({
      ok: true,
      triggered: result.triggered,
      note: result.triggered
        ? 'Poll cycle started'
        : 'A poll cycle was already running; try again shortly',
    }),
  };
}
