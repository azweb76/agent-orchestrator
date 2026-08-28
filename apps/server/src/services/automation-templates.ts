import type { ChatSession, ChatSessionTemplateId } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { createAgentSession } from './sessions.js';
import { enqueueChatMessage } from './chat-queue.js';
import { shouldQueueMutatingStart } from './session-mutex.js';

function hasQueuedMessages(ctx: AppContext, sessionId: string): boolean {
  return ctx.repos.queued.listBySession(sessionId).length > 0;
}

export function hasActiveOrQueuedTemplate(
  ctx: AppContext,
  agentId: string,
  template: ChatSessionTemplateId,
): boolean {
  const sessions = ctx.repos.sessions.listByAgent(agentId);
  return sessions.some(
    (session) =>
      session.template === template &&
      (session.status === 'running' ||
        session.status === 'queued' ||
        hasQueuedMessages(ctx, session.id)),
  );
}

/** Create a template session and start (or queue behind the worktree lock). */
export async function startAutomationTemplate(
  ctx: AppContext,
  agentId: string,
  template: 'fix-ci' | 'address-review',
): Promise<ChatSession | null> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent || agent.archivedAt) return null;
  if (hasActiveOrQueuedTemplate(ctx, agentId, template)) return null;

  const { session, kickoffPrompt } = await createAgentSession(ctx, agentId, { template });
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
