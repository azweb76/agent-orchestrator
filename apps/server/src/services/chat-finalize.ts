import { v4 as uuidv4 } from 'uuid';
import type { ChatSession, Message, MessageMetadata } from '@agent-orchestrator/shared';
import {
  coalesceTimelineText,
  completeRunningTools,
  isTopLevelClaudeResult,
  type StreamPart,
} from '@agent-orchestrator/shared';
import { offerInstructionDraftAfterRun } from './instruction-offer.js';
import { type AppContext, nowIso, notify } from './app-context.js';
import { clearSessionRunFields, syncAgentFromSessions } from './agent-core.js';
import { refreshSessionSearchIndex } from './session-search-index.js';

function extractCostUsd(
  events: Array<Record<string, unknown>>,
  parentSessionId?: string | null,
): number | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event || !isTopLevelClaudeResult(event, parentSessionId)) continue;
    const cost = event.total_cost_usd;
    if (typeof cost === 'number') return cost;
  }
  return undefined;
}

function placeholderAssistantContent(stopped: boolean | undefined, existing?: string): string {
  if (existing?.trim() && existing !== '[no output]') return existing;
  return stopped ? '[stopped]' : '';
}

export function finalizeSessionRun(
  ctx: AppContext,
  session: ChatSession,
  result: {
    result: string;
    sessionId: string | null;
    events?: Array<Record<string, unknown>>;
    stopped?: boolean;
    error?: string;
  },
  assistantText: string,
  extras: MessageMetadata = {},
  options: { assistantMessageId?: string; runLogPath?: string | null } = {},
): Message {
  const latest = ctx.repos.sessions.getById(session.id) ?? session;
  const runLogPath = options.runLogPath ?? session.runLogPath;
  const sameRun =
    (Boolean(runLogPath) && latest.runLogPath === runLogPath) ||
    (session.pid != null && latest.pid === session.pid);

  if (sameRun) {
    ctx.repos.sessions.update(
      clearSessionRunFields(latest, {
        claudeSessionId: result.sessionId ?? latest.claudeSessionId,
        status: 'idle',
      }),
    );
    syncAgentFromSessions(ctx, session.agentId);
    notify(ctx, 'run_finished', {
      agentId: session.agentId,
      sessionId: session.id,
      data: {
        stopped: Boolean(result.stopped),
        error: result.error ?? null,
      },
    });
    void offerInstructionDraftAfterRun(
      ctx,
      latest,
      { stopped: result.stopped, error: result.error },
      async () => (await import('./sessions.js')).gradeAgentSession(ctx, latest.agentId, latest.id),
    );
    void import('./autopilot.js').then(({ maybeAutopilotAfterBuild }) =>
      maybeAutopilotAfterBuild(ctx, latest, {
        stopped: result.stopped,
        error: result.error,
      }).catch((error) => {
        console.warn(`[autopilot] post-build hook failed for session ${latest.id}:`, error);
      }),
    );
  }

  const timeline = extras.timeline ? completeRunningTools(extras.timeline) : extras.timeline;
  const content =
    (typeof result.result === 'string' && result.result.trim() && result.result !== '[stopped]'
      ? result.result
      : '') ||
    assistantText.trim() ||
    coalesceTimelineText(timeline ?? []) ||
    '';
  const metadata: MessageMetadata = {
    ...extras,
    timeline,
    streaming: false,
    costUsd: extras.costUsd ?? extractCostUsd(result.events ?? [], result.sessionId),
    stopped: extras.stopped ?? result.stopped,
    error: extras.error ?? result.error,
  };

  const storedContent = content || placeholderAssistantContent(metadata.stopped);

  const assistantMessageId = options.assistantMessageId;
  let saved: Message;
  if (assistantMessageId) {
    const existing = ctx.repos.messages.getById(session.agentId, assistantMessageId);
    if (!existing) {
      saved = {
        id: assistantMessageId,
        agentId: session.agentId,
        sessionId: session.id,
        role: 'assistant',
        content: storedContent,
        attachments: [],
        metadata,
        createdAt: nowIso(),
      };
      refreshSessionSearchIndex(ctx, session.id);
      return saved;
    }
    saved = ctx.repos.messages.update({
      ...existing,
      content: content || placeholderAssistantContent(metadata.stopped, existing.content),
      metadata: {
        ...existing.metadata,
        ...metadata,
        timeline: metadata.timeline ?? existing.metadata.timeline,
        streaming: false,
      },
    });
  } else {
    const messages = ctx.repos.messages.listBySession(session.id);
    const last = messages[messages.length - 1];

    if (last?.role === 'assistant') {
      saved = ctx.repos.messages.update({
        ...last,
        content: content || placeholderAssistantContent(metadata.stopped, last.content),
        metadata: {
          ...last.metadata,
          ...metadata,
          timeline: metadata.timeline ?? last.metadata.timeline,
          streaming: false,
        },
      });
    } else {
      saved = {
        id: uuidv4(),
        agentId: session.agentId,
        sessionId: session.id,
        role: 'assistant',
        content: storedContent,
        attachments: [],
        metadata,
        createdAt: nowIso(),
      };
      ctx.repos.messages.create(saved);
    }
  }

  refreshSessionSearchIndex(ctx, session.id);
  return saved;
}

export function markStreamingAssistantStopped(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): void {
  const messages = sessionId
    ? ctx.repos.messages.listBySession(sessionId)
    : ctx.repos.messages.listByAgent(agentId);
  const last = messages[messages.length - 1];
  if (last?.role !== 'assistant' || !last.metadata?.streaming) return;
  ctx.repos.messages.update({
    ...last,
    content: last.content || '[stopped]',
    metadata: { ...last.metadata, streaming: false, stopped: true },
  });
}

/** Persist partial assistant output so remounted UIs can load history from the API. */
export function persistAssistantProgress(
  ctx: AppContext,
  message: Message,
  content: string,
  timeline: StreamPart[],
): Message {
  if (!ctx.repos.messages.getById(message.agentId, message.id)) {
    return message;
  }
  const next: Message = {
    ...message,
    content: content || coalesceTimelineText(timeline),
    metadata: {
      ...message.metadata,
      streaming: true,
      timeline,
    },
  };
  return ctx.repos.messages.update(next);
}
