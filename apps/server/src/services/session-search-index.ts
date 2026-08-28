import type { SessionSearchHit } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { nowIso } from './app-context.js';

const SUMMARY_MAX = 500;

export function summarizeAssistantContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed || trimmed === '[stopped]' || trimmed === '[no output]') return '';
  return trimmed.length > SUMMARY_MAX ? trimmed.slice(0, SUMMARY_MAX) : trimmed;
}

/** Rebuild the local search row for one session from persisted messages. */
export function refreshSessionSearchIndex(ctx: AppContext, sessionId: string): void {
  const session = ctx.repos.sessions.getById(sessionId);
  if (!session) {
    ctx.repos.sessionSearch.delete(sessionId);
    return;
  }

  const messages = ctx.repos.messages.listBySession(sessionId);
  const firstUser = messages.find((item) => item.role === 'user');
  const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant');

  ctx.repos.sessionSearch.upsert({
    sessionId: session.id,
    agentId: session.agentId,
    title: session.title,
    firstPrompt: firstUser?.content ?? '',
    lastSummary: lastAssistant ? summarizeAssistantContent(lastAssistant.content) : '',
    updatedAt: session.updatedAt,
  });
}

export function removeSessionSearchIndex(ctx: AppContext, sessionId: string): void {
  ctx.repos.sessionSearch.delete(sessionId);
}

export function searchSessionTranscripts(
  ctx: AppContext,
  query: string,
  limit = 24,
): SessionSearchHit[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return ctx.repos.sessionSearch.search(tokens, limit);
}

/** Backfill the search index for every persisted session (migration / repair). */
export function backfillSessionSearchIndex(ctx: AppContext): void {
  for (const workspace of ctx.repos.workspaces.list()) {
    for (const agent of ctx.repos.agents.listByWorkspace(workspace.id)) {
      for (const session of ctx.repos.sessions.listByAgent(agent.id)) {
        refreshSessionSearchIndex(ctx, session.id);
      }
    }
  }
}

/** Touch index updated_at after a session title change without re-reading messages. */
export function touchSessionSearchTitle(ctx: AppContext, sessionId: string, title: string): void {
  const session = ctx.repos.sessions.getById(sessionId);
  if (!session) return;
  const messages = ctx.repos.messages.listBySession(sessionId);
  const firstUser = messages.find((item) => item.role === 'user');
  const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant');
  ctx.repos.sessionSearch.upsert({
    sessionId: session.id,
    agentId: session.agentId,
    title,
    firstPrompt: firstUser?.content ?? '',
    lastSummary: lastAssistant ? summarizeAssistantContent(lastAssistant.content) : '',
    updatedAt: nowIso(),
  });
}
