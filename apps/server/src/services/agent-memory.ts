import { v4 as uuidv4 } from 'uuid';
import type {
  AgentMemory,
  CreateAgentMemoryRequest,
  UpdateAgentMemoryRequest,
} from '@agent-orchestrator/shared';
import {
  formatMemoriesForSystemPrompt,
  mergeSystemPromptWithMemories,
} from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';
import { requireAgent } from './agent-core.js';

function sanitizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function resolveWorkspaceId(ctx: AppContext, agentId: string): string {
  const agent = requireAgent(ctx, agentId);
  const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
  if (!worktree) throw new Error('Worktree not found');
  return worktree.workspaceId;
}

export function listAgentMemories(ctx: AppContext, agentId: string): AgentMemory[] {
  const workspaceId = resolveWorkspaceId(ctx, agentId);
  return ctx.repos.memories.listForAgentView(agentId, workspaceId);
}

export function listActiveMemoriesForPrompt(ctx: AppContext, agentId: string): AgentMemory[] {
  const workspaceId = resolveWorkspaceId(ctx, agentId);
  return ctx.repos.memories.listActiveForAgent(agentId, workspaceId);
}

/** Resolve `--append-system-prompt` including active orchestrator memories. */
export function resolveSessionSystemPrompt(
  ctx: AppContext,
  agentId: string,
  base: string | null | undefined,
): string | null {
  const memories = listActiveMemoriesForPrompt(ctx, agentId);
  const block = formatMemoriesForSystemPrompt(memories);
  return mergeSystemPromptWithMemories(base, block);
}

export function createAgentMemory(
  ctx: AppContext,
  agentId: string,
  body: CreateAgentMemoryRequest,
): AgentMemory {
  requireAgent(ctx, agentId);
  const workspaceId = resolveWorkspaceId(ctx, agentId);
  const key = sanitizeKey(body.key);
  if (!key) throw new Error('Memory key is required');
  const content = body.content.trim();
  if (!content) throw new Error('Memory content is required');

  const scope = body.scope;
  let resolvedWorkspaceId: string | null = null;
  let resolvedAgentId: string | null = null;
  if (scope === 'workspace') {
    resolvedWorkspaceId = body.workspaceId?.trim() || workspaceId;
  } else if (scope === 'agent') {
    resolvedAgentId = body.agentId?.trim() || agentId;
    resolvedWorkspaceId = workspaceId;
  }

  const existing = ctx.repos.memories.findActiveByScopeKey({
    scope,
    workspaceId: resolvedWorkspaceId,
    agentId: resolvedAgentId,
    key,
  });
  const timestamp = nowIso();
  if (existing) {
    return ctx.repos.memories.update({
      ...existing,
      kind: body.kind ?? existing.kind,
      content,
      sourceSessionId: body.sourceSessionId?.trim() || existing.sourceSessionId,
      updatedAt: timestamp,
    });
  }

  return ctx.repos.memories.create({
    id: uuidv4(),
    scope,
    workspaceId: resolvedWorkspaceId,
    agentId: resolvedAgentId,
    kind: body.kind ?? 'fact',
    key,
    content,
    source: 'user',
    sourceSessionId: body.sourceSessionId?.trim() || null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function updateAgentMemory(
  ctx: AppContext,
  agentId: string,
  memoryId: string,
  body: UpdateAgentMemoryRequest,
): AgentMemory {
  requireAgent(ctx, agentId);
  const current = ctx.repos.memories.getById(memoryId);
  if (!current) throw new Error('Memory not found');

  const workspaceId = resolveWorkspaceId(ctx, agentId);
  const visible =
    current.scope === 'global' ||
    (current.scope === 'workspace' && current.workspaceId === workspaceId) ||
    (current.scope === 'agent' && current.agentId === agentId);
  if (!visible) throw new Error('Memory not found');

  const nextKey = body.key !== undefined ? sanitizeKey(body.key) : current.key;
  if (!nextKey) throw new Error('Memory key is required');
  const nextContent = body.content !== undefined ? body.content.trim() : current.content;
  if (!nextContent) throw new Error('Memory content is required');

  return ctx.repos.memories.update({
    ...current,
    kind: body.kind ?? current.kind,
    key: nextKey,
    content: nextContent,
    status: body.status ?? current.status,
    updatedAt: nowIso(),
  });
}

export function deleteAgentMemory(ctx: AppContext, agentId: string, memoryId: string): void {
  requireAgent(ctx, agentId);
  const current = ctx.repos.memories.getById(memoryId);
  if (!current) throw new Error('Memory not found');
  const workspaceId = resolveWorkspaceId(ctx, agentId);
  const visible =
    current.scope === 'global' ||
    (current.scope === 'workspace' && current.workspaceId === workspaceId) ||
    (current.scope === 'agent' && current.agentId === agentId);
  if (!visible) throw new Error('Memory not found');
  ctx.repos.memories.delete(memoryId);
}
