import { v4 as uuidv4 } from 'uuid';
import type { ChatSession, TaskSuggestion, TaskSuggestionsOffer } from '@agent-orchestrator/shared';
import { type AppContext, makeEvent, notify } from './app-context.js';
import { extractJsonObject } from './extract-json-object.js';

const OFFER_KEY = (agentId: string) => `task-suggestions.offer:${agentId}`;
const MIN_SUGGESTIONS = 2;
const MAX_SUGGESTIONS = 4;

export interface TaskSuggestionsContext {
  sessionTitle: string;
  lastAssistantMessage: string;
}

export function buildTaskSuggestionsPrompt(context: TaskSuggestionsContext): {
  system: string;
  user: string;
} {
  const system = [
    'You read the final reply from a coding-agent chat session and propose concrete follow-up tasks.',
    'Call the submit_task_suggestions tool with 2 to 4 suggestions.',
    'If you cannot call a tool, respond with ONLY a JSON object {"suggestions": [...]} (no markdown fences or extra text).',
    'Each suggestion is {"title":"...","prompt":"..."}.',
    '"title" is a short label, 3-6 words, no trailing punctuation.',
    '"prompt" is a ready-to-send instruction for a new session that continues the work, written as if the user were asking for it directly.',
    'Base suggestions only on what the final reply says was done, found, or left open. Do not invent unrelated work.',
    'Prefer concrete, actionable next steps (e.g. add tests, fix a mentioned issue, extend to another file) over vague ideas.',
  ].join(' ');

  const user = [
    `Session: ${context.sessionTitle}`,
    'Final assistant reply:',
    context.lastAssistantMessage || '(empty)',
  ].join('\n\n');

  return { system, user };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseTaskSuggestionsResponse(raw: unknown): TaskSuggestion[] {
  const parsed = extractJsonObject(raw, 'Task suggestions response');
  const items = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

  const suggestions: TaskSuggestion[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const title = asString(row.title);
    const prompt = asString(row.prompt);
    if (!title || !prompt) continue;
    suggestions.push({ id: uuidv4(), title, prompt });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return suggestions.length >= MIN_SUGGESTIONS ? suggestions : [];
}

export function getTaskSuggestionsOffer(ctx: AppContext, agentId: string): TaskSuggestionsOffer | null {
  const raw = ctx.repos.automationState.get(OFFER_KEY(agentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TaskSuggestionsOffer;
  } catch {
    return null;
  }
}

export function setTaskSuggestionsOffer(
  ctx: AppContext,
  agentId: string,
  offer: TaskSuggestionsOffer,
): void {
  ctx.repos.automationState.set(OFFER_KEY(agentId), JSON.stringify(offer));
}

export function clearTaskSuggestionsOffer(ctx: AppContext, agentId: string): void {
  ctx.repos.automationState.delete(OFFER_KEY(agentId));
}

/** After any session finishes cleanly, offer LLM-generated follow-up tasks based on its final reply. */
export async function maybeSuggestFollowUpTasks(
  ctx: AppContext,
  session: ChatSession,
  outcome: { stopped?: boolean; error?: string | null },
): Promise<void> {
  if (outcome.stopped || outcome.error) return;

  const messages = ctx.repos.messages.listBySession(session.id);
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant?.content.trim()) return;

  const context: TaskSuggestionsContext = {
    lastAssistantMessage: lastAssistant.content,
    sessionTitle: session.title ?? 'Chat',
  };
  const suggestions = await ctx.anthropic.generateTaskSuggestions(context);
  if (!suggestions.length) return;

  const offer: TaskSuggestionsOffer = { sessionId: session.id, suggestions };
  setTaskSuggestionsOffer(ctx, session.agentId, offer);
  ctx.repos.events.create(
    makeEvent(session.agentId, 'task_suggestions_offered', { sessionId: session.id }),
  );
  notify(ctx, 'task_suggestions_offer', {
    agentId: session.agentId,
    sessionId: session.id,
    data: { suggestionCount: suggestions.length },
  });
}
