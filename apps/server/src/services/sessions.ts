import type {
  AgentDetail,
  ChatSession,
  CreateChatSessionRequest,
  Message,
  RewindChatRequest,
  RewindChatResponse,
  UpdateChatSessionRequest,
} from '@agent-orchestrator/shared';
import { chatSessionTemplateById } from '@agent-orchestrator/shared';
import { buildTemplateKickoffPrompt } from './session-kickoff.js';
import { type AppContext, makeEvent, nowIso } from './app-context.js';
import {
  createSessionForAgent,
  requireAgent,
  requireSession,
  sessionTitleSource,
  syncAgentFromSessions,
} from './agent-core.js';
import { getAgentDetail } from './agents-lifecycle.js';
import { cleanupQueuedAttachments, clearSessionQueue, drainWaitingMutatingSessions } from './chat-queue.js';
import { cleanupMessageAttachments } from './chat-run-lifecycle.js';
export {
  gradeAgentSession,
  listAgentInstructionFiles,
  generateAgentInstructionDraft,
  applyAgentInstructionFile,
  getAgentSessionContext,
} from './session-grade-instructions.js';

export async function createAgentSession(
  ctx: AppContext,
  agentId: string,
  body: CreateChatSessionRequest = {},
): Promise<{ session: ChatSession; kickoffPrompt: string | null }> {
  const agent = requireAgent(ctx, agentId);
  if (agent.archivedAt) throw new Error('Cannot create a session on an archived agent');

  const template = chatSessionTemplateById(body.template ?? 'chat');
  if (body.template && !template) throw new Error('Unknown session template');

  const session = createSessionForAgent(ctx, agent, {
    template: template?.id ?? 'chat',
    title: body.title,
    permissionMode: template?.permissionMode,
    activate: true,
  });
  if (session.template === 'create-draft-pr') {
    const { onCreateDraftPrSessionStarted } = await import('./autopilot.js');
    onCreateDraftPrSessionStarted(ctx, agentId);
  }
  ctx.repos.events.create(
    makeEvent(agentId, 'session_created', {
      sessionId: session.id,
      template: session.template,
    }),
  );
  const basePrompt = template?.prompt ?? null;
  const kickoffPrompt =
    basePrompt && (session.template === 'address-review' || session.template === 'fix-ci')
      ? await buildTemplateKickoffPrompt(
          { repos: ctx.repos, github: ctx.github },
          agent.worktreeId,
          session.template,
          basePrompt,
        )
      : basePrompt;
  return { session, kickoffPrompt };
}

export async function updateAgentSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  body: UpdateChatSessionRequest,
): Promise<ChatSession> {
  const agent = requireAgent(ctx, agentId);
  if (agent.archivedAt) throw new Error('Cannot update a session on an archived agent');
  const session = requireSession(ctx, agentId, sessionId);
  const requestedTitle = body.title?.trim();
  const updated = ctx.repos.sessions.update({
    ...session,
    title: requestedTitle || session.title,
    titleSource: requestedTitle ? 'user' : sessionTitleSource(session),
    model: body.model ?? session.model,
    effort: body.effort ?? session.effort,
    permissionMode: body.permissionMode ?? session.permissionMode,
    updatedAt: nowIso(),
  });
  syncAgentFromSessions(ctx, agentId);
  return updated;
}

export async function deleteAgentSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
): Promise<AgentDetail> {
  const agent = requireAgent(ctx, agentId);
  if (agent.archivedAt) throw new Error('Cannot delete a session on an archived agent');
  const session = requireSession(ctx, agentId, sessionId);

  if (session.status === 'running' || session.pid != null) {
    ctx.claude.stop(session.id, session.pid, session.runLogPath);
  }

  const messages = ctx.repos.messages.listBySession(session.id);
  const queued = ctx.repos.queued.listBySession(session.id);
  await cleanupMessageAttachments(messages);
  await cleanupQueuedAttachments(queued.flatMap((item) => item.attachments));
  ctx.repos.messages.deleteBySession(session.id);
  ctx.repos.sessions.delete(session.id);

  const remaining = ctx.repos.sessions.listByAgent(agentId);
  if (remaining.length === 0) {
    createSessionForAgent(ctx, requireAgent(ctx, agentId), { activate: true });
  } else if (agent.activeSessionId === session.id) {
    ctx.repos.agents.update({
      ...requireAgent(ctx, agentId),
      activeSessionId: remaining[0]!.id,
      updatedAt: nowIso(),
    });
  }

  syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(
    makeEvent(agentId, 'session_deleted', {
      sessionId: session.id,
      title: session.title,
    }),
  );
  void drainWaitingMutatingSessions(ctx, agentId);
  return getAgentDetail(ctx, agentId);
}

export async function activateAgentSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
): Promise<AgentDetail> {
  requireSession(ctx, agentId, sessionId);
  const agent = requireAgent(ctx, agentId);
  ctx.repos.agents.update({
    ...agent,
    activeSessionId: sessionId,
    updatedAt: nowIso(),
  });
  syncAgentFromSessions(ctx, agentId);
  return getAgentDetail(ctx, agentId);
}

export function getAgentMessages(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): Message[] {
  const session = requireSession(ctx, agentId, sessionId);
  return ctx.repos.messages.listBySession(session.id);
}

export async function clearAgentChat(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): Promise<{ cleared: number }> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot clear chat for archived agent');
  const session = requireSession(ctx, agentId, sessionId);
  if (session.status === 'running') {
    throw new Error('Cannot clear chat while the session is running. Stop it first.');
  }

  await clearSessionQueue(ctx, session.id);
  const messages = ctx.repos.messages.listBySession(session.id);
  await cleanupMessageAttachments(messages);
  const cleared = ctx.repos.messages.deleteBySession(session.id);
  ctx.repos.sessions.update({
    ...session,
    claudeSessionId: null,
    runLogPath: null,
    status: session.status === 'queued' ? 'idle' : session.status,
    updatedAt: nowIso(),
  });
  ctx.repos.sessions.clearGrade(session.id);
  syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(makeEvent(agentId, 'chat_cleared', { cleared, sessionId: session.id }));
  return { cleared };
}

/**
 * Rewind conversation to a user message: drop that turn and everything after,
 * reset the Claude session, and return the prompt for the composer draft.
 * Earlier messages remain in the UI; the next send starts a fresh Claude session.
 */
export async function rewindAgentChat(
  ctx: AppContext,
  agentId: string,
  body: RewindChatRequest,
  sessionId?: string,
): Promise<RewindChatResponse> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot rewind chat for archived agent');

  const target = ctx.repos.messages.getById(agentId, body.messageId);
  if (!target) throw new Error('Message not found');
  if (target.role !== 'user') {
    throw new Error('Rewind is only supported from a user message');
  }

  const session = requireSession(ctx, agentId, sessionId ?? target.sessionId);
  if (session.status === 'running') {
    throw new Error('Cannot rewind chat while the session is running. Stop it first.');
  }

  const all = ctx.repos.messages.listBySession(session.id);
  const index = all.findIndex((item) => item.id === body.messageId);
  if (index < 0) throw new Error('Message not found');
  const dropped = all.slice(index);

  const { removed, target: deleted } = ctx.repos.messages.deleteFrom(agentId, body.messageId);
  if (!deleted || removed === 0) throw new Error('Message not found');

  await cleanupMessageAttachments(dropped);
  await clearSessionQueue(ctx, session.id);

  ctx.repos.sessions.update({
    ...session,
    claudeSessionId: null,
    runLogPath: null,
    updatedAt: nowIso(),
  });
  ctx.repos.sessions.clearGrade(session.id);
  syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(
    makeEvent(agentId, 'chat_rewound', {
      messageId: body.messageId,
      removed,
      sessionId: session.id,
    }),
  );

  return {
    removed,
    draft: deleted.content === '(image attachment)' ? '' : deleted.content,
    messageId: body.messageId,
  };
}
