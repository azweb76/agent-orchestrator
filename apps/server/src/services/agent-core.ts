import { v4 as uuidv4 } from 'uuid';
import type {
  Agent,
  AgentTask,
  ChatSession,
  ChatSessionTemplateId,
  EffortLevel,
  PermissionMode,
} from '@agent-orchestrator/shared';
import {
  DEFAULT_EFFORT_LEVEL,
  DEFAULT_PERMISSION_MODE,
  chatSessionTemplateById,
  sanitizeAgentTaskAllowedTools,
  uniqueSessionTitle,
} from '@agent-orchestrator/shared';
import { fallbackTitleFromPrompt, sanitizeChatTitle } from './anthropic.js';
import { type AppContext, nowIso, notify } from './app-context.js';
import { refreshSessionSearchIndex, touchSessionSearchTitle } from './session-search-index.js';

export async function createAgentForWorktree(
  ctx: AppContext,
  worktreeId: string,
  name: string,
  options?: {
    model?: string;
    effort?: EffortLevel;
    permissionMode?: PermissionMode;
    task?: AgentTask;
  },
): Promise<Agent> {
  const existing = ctx.repos.agents.getByWorktreeId(worktreeId);
  if (existing) {
    throw new Error('This worktree already has an active agent');
  }

  const task = options?.task;
  const timestamp = nowIso();
  const agent: Agent = {
    id: uuidv4(),
    worktreeId,
    name,
    status: 'idle',
    model: options?.model?.trim() || task?.model || 'sonnet',
    effort: options?.effort ?? task?.effort ?? DEFAULT_EFFORT_LEVEL,
    permissionMode:
      options?.permissionMode ?? task?.permissionMode ?? DEFAULT_PERMISSION_MODE,
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    activeSessionId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };

  ctx.repos.agents.create(agent);
  const session = createSessionForAgent(ctx, agent, {
    template: 'chat',
    permissionMode: agent.permissionMode,
    model: agent.model,
    effort: agent.effort,
    task,
  });
  return { ...agent, activeSessionId: session.id };
}

export function sessionTitleSource(session: ChatSession): NonNullable<ChatSession['titleSource']> {
  return session.titleSource ?? 'default';
}

export async function maybeAutoNameChatSession(
  ctx: AppContext,
  session: ChatSession,
  prompt: string,
): Promise<ChatSession | null> {
  const latest = ctx.repos.sessions.getById(session.id) ?? session;
  if (sessionTitleSource(latest) === 'user') return null;

  const userTurns = ctx.repos.messages
    .listBySession(session.id)
    .filter((item) => item.role === 'user');
  if (userTurns.length !== 1) return null;

  let title: string;
  try {
    title = await ctx.anthropic.suggestChatTitle(prompt);
  } catch {
    title = fallbackTitleFromPrompt(prompt);
  }
  title = sanitizeChatTitle(title, prompt);

  const current = ctx.repos.sessions.getById(session.id);
  if (!current || sessionTitleSource(current) === 'user') return null;

  const siblings = ctx.repos.sessions
    .listByAgent(session.agentId)
    .filter((item) => item.id !== session.id);
  const unique = uniqueSessionTitle(
    siblings.map((item) => item.title),
    title,
  );
  if (unique === current.title && sessionTitleSource(current) === 'auto') return current;

  const updated = ctx.repos.sessions.update({
    ...current,
    title: unique,
    titleSource: 'auto',
    updatedAt: nowIso(),
  });
  touchSessionSearchTitle(ctx, updated.id, updated.title);
  return updated;
}

/** Write session runtime fields without clobbering a title that landed concurrently. */
export function persistSessionRuntime(ctx: AppContext, session: ChatSession): ChatSession {
  const latest = ctx.repos.sessions.getById(session.id);
  const next: ChatSession = {
    ...session,
    title: latest?.title ?? session.title,
    titleSource: latest?.titleSource ?? session.titleSource,
  };
  ctx.repos.sessions.update(next);
  return next;
}

export function createSessionForAgent(
  ctx: AppContext,
  agent: Agent,
  options: {
    title?: string;
    template?: ChatSessionTemplateId;
    permissionMode?: PermissionMode;
    model?: string;
    effort?: EffortLevel;
    task?: AgentTask;
    activate?: boolean;
  } = {},
): ChatSession {
  const task = options.task;
  const template = chatSessionTemplateById(options.template ?? 'chat');
  const timestamp = nowIso();
  const existing = ctx.repos.sessions.listByAgent(agent.id);
  const requestedTitle = options.title?.trim();
  const title =
    requestedTitle ||
    uniqueSessionTitle(
      existing.map((item) => item.title),
      task?.title ?? template?.title ?? 'Chat',
    );
  const session: ChatSession = {
    id: uuidv4(),
    agentId: agent.id,
    title,
    template: template?.id ?? 'chat',
    status: 'idle',
    model: options.model?.trim() || task?.model || agent.model,
    effort: options.effort ?? task?.effort ?? agent.effort,
    permissionMode:
      options.permissionMode ??
      task?.permissionMode ??
      template?.permissionMode ??
      DEFAULT_PERMISSION_MODE,
    agentTaskId: task?.id ?? null,
    systemPrompt: task?.systemPrompt?.trim() || null,
    allowedTools: sanitizeAgentTaskAllowedTools(task?.allowedTools),
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    titleSource: requestedTitle ? 'user' : 'default',
  };
  ctx.repos.sessions.create(session);
  refreshSessionSearchIndex(ctx, session.id);
  if (options.activate !== false) {
    ctx.repos.agents.update({
      ...ctx.repos.agents.getById(agent.id)!,
      activeSessionId: session.id,
      permissionMode: session.permissionMode,
      model: session.model,
      effort: session.effort,
      updatedAt: timestamp,
    });
  }
  return session;
}

export function requireAgent(ctx: AppContext, agentId: string): Agent {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  return agent;
}

export function requireSession(ctx: AppContext, agentId: string, sessionId?: string | null): ChatSession {
  const agent = requireAgent(ctx, agentId);
  let id = sessionId || agent.activeSessionId;
  if (!id) {
    const existing = ctx.repos.sessions.listByAgent(agentId);
    if (existing[0]) {
      id = existing[0].id;
      ctx.repos.agents.update({ ...agent, activeSessionId: id, updatedAt: nowIso() });
    } else {
      return createSessionForAgent(ctx, agent);
    }
  }
  const session = ctx.repos.sessions.getById(id);
  if (!session || session.agentId !== agentId) throw new Error('Session not found');
  return session;
}

/** Roll up session run state onto the agent (status, active-session snapshot). */
export function syncAgentFromSessions(ctx: AppContext, agentId: string): Agent {
  const agent = requireAgent(ctx, agentId);
  const sessions = ctx.repos.sessions.listByAgent(agentId);
  const anyRunning = sessions.some((item) => item.status === 'running');
  const active =
    sessions.find((item) => item.id === agent.activeSessionId) ?? sessions[0] ?? null;
  const updated = ctx.repos.agents.update({
    ...agent,
    status: agent.archivedAt ? 'archived' : anyRunning ? 'running' : 'idle',
    pid: active?.pid ?? null,
    runLogPath: active?.runLogPath ?? null,
    claudeSessionId: active?.claudeSessionId ?? null,
    permissionMode: active?.permissionMode ?? agent.permissionMode,
    model: active?.model ?? agent.model,
    effort: active?.effort ?? agent.effort,
    activeSessionId: active?.id ?? agent.activeSessionId,
    updatedAt: nowIso(),
  });
  notify(ctx, 'agent_changed', { agentId, data: { status: updated.status } });
  return updated;
}

export function clearSessionRunFields(
  session: ChatSession,
  overrides: Partial<ChatSession> = {},
): ChatSession {
  return {
    ...session,
    ...overrides,
    pid: null,
    // Keep the last run log path so context usage / grading can still read the
    // stream after stop when the Claude session JSONL is missing or incomplete.
    updatedAt: nowIso(),
  };
}
