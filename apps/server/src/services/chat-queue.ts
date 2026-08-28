import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import type {
  AgentEvent,
  AppEventType,
  ChatRequest,
  ChatSession,
  EnqueueChatMessageRequest,
  MessageAttachment,
  QueuedChatMessage,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app.js';
import { evaluateSpendCap, type SpendCapEvaluation } from './spend-cap.js';
import {
  findRunningMutatingPeer,
  findRunningMutatingSession,
  isGitMutatingSession,
  nextWaitingMutatingSession,
  shouldQueueMutatingStart,
} from './session-mutex.js';

function nowIso(): string {
  return new Date().toISOString();
}

function notify(
  ctx: AppContext,
  type: AppEventType,
  fields: { agentId?: string; sessionId?: string; data?: Record<string, unknown> } = {},
): void {
  ctx.notifier?.emit(type, fields);
}

function makeEvent(agentId: string, type: string, data: Record<string, unknown>): AgentEvent {
  return {
    id: uuidv4(),
    agentId,
    type,
    data,
    createdAt: nowIso(),
  };
}

async function cleanupAttachmentFiles(attachments: MessageAttachment[]): Promise<void> {
  const fs = await import('node:fs/promises');
  for (const attachment of attachments) {
    if (!attachment.path) continue;
    try {
      await fs.unlink(attachment.path);
    } catch {
      // best-effort cleanup
    }
  }
}

function requireAgent(ctx: AppContext, agentId: string) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  return agent;
}

function requireSession(ctx: AppContext, agentId: string, sessionId: string): ChatSession {
  const session = ctx.repos.sessions.getById(sessionId);
  if (!session || session.agentId !== agentId) throw new Error('Session not found');
  return session;
}

function hasQueuedMessages(ctx: AppContext, sessionId: string): boolean {
  return ctx.repos.queued.listBySession(sessionId).length > 0;
}

export function markSessionQueued(ctx: AppContext, session: ChatSession): ChatSession {
  if (session.status === 'queued') return session;
  const updated = ctx.repos.sessions.update({
    ...session,
    status: 'queued',
    updatedAt: nowIso(),
  });
  notify(ctx, 'agent_changed', {
    agentId: session.agentId,
    sessionId: session.id,
    data: { status: 'queued' },
  });
  return updated;
}

/** Drop every queued message for a session (and their attachment files). */
export async function clearSessionQueue(ctx: AppContext, sessionId: string): Promise<number> {
  const queued = ctx.repos.queued.listBySession(sessionId);
  for (const item of queued) {
    await cleanupAttachmentFiles(item.attachments);
  }
  return ctx.repos.queued.deleteBySession(sessionId);
}

export async function cleanupQueuedAttachments(attachments: MessageAttachment[]): Promise<void> {
  await cleanupAttachmentFiles(attachments);
}

/**
 * Persist a follow-up while the session is busy. The queue drains server-side
 * as soon as the running reply finishes, so queued messages survive browser
 * closes and orchestrator restarts.
 */
export async function enqueueChatMessage(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  body: EnqueueChatMessageRequest,
  options: { drain?: boolean } = {},
): Promise<QueuedChatMessage> {
  const agent = requireAgent(ctx, agentId);
  if (agent.archivedAt) throw new Error('Cannot queue messages on an archived agent');
  const session = requireSession(ctx, agentId, sessionId);

  const message = body.message.trim();
  const hasMentions = (body.mentions?.length ?? 0) > 0;
  if (!message && !(body.images && body.images.length > 0) && !hasMentions) {
    throw new Error('Message or image attachment required');
  }

  const { saveChatImages } = await import('./app.js');
  const attachments = await saveChatImages(ctx, agentId, body.images);
  const mentions = body.mentions ?? [];
  const queued: QueuedChatMessage = {
    id: uuidv4(),
    agentId,
    sessionId: session.id,
    content: message || (hasMentions ? '(mention attachment)' : '(image attachment)'),
    attachments,
    mentions,
    createdAt: nowIso(),
  };
  ctx.repos.queued.create(queued);
  ctx.repos.events.create(
    makeEvent(agentId, 'message_queued', { queuedId: queued.id, sessionId: session.id }),
  );
  notify(ctx, 'queue_changed', { agentId, sessionId: session.id });

  if (options.drain === false) return queued;

  const latest = ctx.repos.sessions.getById(session.id);
  if (latest && latest.status !== 'running') {
    if (shouldQueueMutatingStart(ctx.repos.sessions.listByAgent(agentId), latest)) {
      markSessionQueued(ctx, latest);
      return queued;
    }
    void drainSessionQueue(ctx, agentId, session.id);
  }
  return queued;
}

export function listQueuedMessages(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
): QueuedChatMessage[] {
  const session = requireSession(ctx, agentId, sessionId);
  return ctx.repos.queued.listBySession(session.id);
}

export async function removeQueuedMessage(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  queuedId: string,
): Promise<{ removed: boolean }> {
  requireSession(ctx, agentId, sessionId);
  const queued = ctx.repos.queued.getById(queuedId);
  if (!queued || queued.agentId !== agentId || queued.sessionId !== sessionId) return { removed: false };
  await cleanupAttachmentFiles(queued.attachments);
  ctx.repos.queued.delete(queuedId);
  notify(ctx, 'queue_changed', { agentId, sessionId: queued.sessionId });
  return { removed: true };
}

/** Sessions currently draining, to keep concurrent finalizers from double-sending. */
const drainingSessions = new Set<string>();
const drainingMutatingAgents = new Set<string>();

/**
 * Send queued messages for an idle session, in order, until the queue is empty
 * or the session is busy/archived. Safe to call from any finalization path.
 */
export async function drainSessionQueue(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
): Promise<void> {
  if (drainingSessions.has(sessionId)) return;
  drainingSessions.add(sessionId);
  try {
    while (true) {
      const agent = ctx.repos.agents.getById(agentId);
      if (!agent || agent.archivedAt) return;
      const session = ctx.repos.sessions.getById(sessionId);
      if (!session || session.status === 'running') return;
      const spendBlock = evaluateSpendCap(ctx, agentId);
      if (spendBlock) {
        ctx.repos.queued.setBlockedReason(sessionId, spendBlock.reason);
        return;
      }
      ctx.repos.queued.clearBlockedReason(sessionId);
      if (shouldQueueMutatingStart(ctx.repos.sessions.listByAgent(agentId), session)) {
        markSessionQueued(ctx, session);
        return;
      }
      const next = ctx.repos.queued.takeNext(sessionId);
      if (!next) {
        clearQueuedStatusIfIdle(ctx, session);
        return;
      }
      ctx.repos.events.create(
        makeEvent(agentId, 'queued_message_sent', { queuedId: next.id, sessionId }),
      );
      notify(ctx, 'queue_changed', { agentId, sessionId });
      try {
        const { streamAgentChat } = await import('./app.js');
        await streamAgentChat(ctx, agentId, { message: next.content, mentions: next.mentions }, null, sessionId, {
          attachments: next.attachments,
        });
      } catch (error) {
        console.error(`Failed to send queued message for session ${sessionId}:`, error);
        return;
      }
    }
  } finally {
    drainingSessions.delete(sessionId);
    void drainWaitingMutatingSessions(ctx, agentId);
  }
}

function clearQueuedStatusIfIdle(ctx: AppContext, session: ChatSession): void {
  const latest = ctx.repos.sessions.getById(session.id);
  if (!latest || latest.status !== 'queued') return;
  if (hasQueuedMessages(ctx, latest.id)) return;
  ctx.repos.sessions.update({
    ...latest,
    status: 'idle',
    updatedAt: nowIso(),
  });
  notify(ctx, 'agent_changed', {
    agentId: latest.agentId,
    sessionId: latest.id,
    data: { status: 'idle' },
  });
}

/** Start the next git-mutating session waiting on this agent/worktree. */
export async function drainWaitingMutatingSessions(
  ctx: AppContext,
  agentId: string,
): Promise<void> {
  if (drainingMutatingAgents.has(agentId)) return;
  drainingMutatingAgents.add(agentId);
  try {
    while (true) {
      const sessions = ctx.repos.sessions.listByAgent(agentId);
      if (findRunningMutatingSession(sessions)) return;
      const next = nextWaitingMutatingSession(sessions, (id) => hasQueuedMessages(ctx, id));
      if (!next) return;
      await drainSessionQueue(ctx, agentId, next.id);
    }
  } finally {
    drainingMutatingAgents.delete(agentId);
  }
}

/**
 * Queue a chat turn blocked by spend caps and notify the client / event bus.
 */
export async function enqueueSpendCapBlocked(
  ctx: AppContext,
  agentId: string,
  session: ChatSession,
  body: EnqueueChatMessageRequest,
  block: SpendCapEvaluation,
  res: Response | null,
): Promise<QueuedChatMessage> {
  const { saveChatImages } = await import('./app.js');
  const attachments = await saveChatImages(ctx, agentId, body.images);
  const mentions = body.mentions ?? [];
  const hasMentions = mentions.length > 0;
  const message = body.message.trim();
  const queued: QueuedChatMessage = {
    id: uuidv4(),
    agentId,
    sessionId: session.id,
    content: message || (hasMentions ? '(mention attachment)' : '(image attachment)'),
    attachments,
    mentions,
    blockedReason: block.reason,
    createdAt: nowIso(),
  };
  ctx.repos.queued.create(queued);
  ctx.repos.events.create(
    makeEvent(agentId, 'message_queued', {
      queuedId: queued.id,
      sessionId: session.id,
      blockedReason: block.reason,
    }),
  );
  notify(ctx, 'queue_changed', { agentId, sessionId: session.id });
  notify(ctx, 'spend_cap_blocked', {
    agentId,
    sessionId: session.id,
    data: { reason: block.reason, message: block.message },
  });

  if (res) {
    attachChatSse(res);
    writeSse(res, 'blocked', {
      reason: block.reason,
      message: block.message,
      queuedId: queued.id,
    });
    if (!res.writableEnded) res.end();
  }
  return queued;
}

/**
 * Park a mutating chat turn on the existing follow-up queue until the worktree
 * lock is free. Does not start Claude and does not SIGKILL a peer.
 */
export async function enqueueBehindWorktreeLock(
  ctx: AppContext,
  agentId: string,
  session: ChatSession,
  body: ChatRequest,
  res: Response | null,
): Promise<ChatSession> {
  await enqueueChatMessage(
    ctx,
    agentId,
    session.id,
    { message: body.message, images: body.images, mentions: body.mentions },
    { drain: false },
  );
  const queuedSession = markSessionQueued(ctx, ctx.repos.sessions.getById(session.id) ?? session);
  if (res) {
    attachChatSse(res);
    writeSse(res, 'session', queuedSession);
    writeSse(res, 'queued', { sessionId: queuedSession.id, status: 'queued' });
    if (!res.writableEnded) res.end();
  }
  return queuedSession;
}

function attachChatSse(res: Response): void {
  try {
    res.socket?.setTimeout(0);
    res.socket?.setNoDelay?.(true);
  } catch {
    // ignore — some test doubles have no socket
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function writeSse(res: Response, event: string, data: unknown): boolean {
  if (res.writableEnded) return false;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export { isGitMutatingSession, shouldQueueMutatingStart, findRunningMutatingPeer };
