import type { Response } from 'express';
import type { ChatSession, Message } from '@agent-orchestrator/shared';
import type { StreamPart } from '@agent-orchestrator/shared';
import {
  appendStreamText,
  applyStreamEvent,
  adoptParentClaudeSessionId,
  parentStreamTextDelta,
} from '@agent-orchestrator/shared';
import { followClaudeLog, isPidAlive, readClaudeLogSnapshot } from './git.js';
import { type AppContext, nowIso } from './app-context.js';
import { requireAgent, requireSession } from './agent-core.js';
import {
  attachChatSse,
  startSseHeartbeat,
  writeSse,
  resolveRunHandle,
  waitForSettledAssistant,
} from './chat-sse.js';

export async function followAgentSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  res: Response,
): Promise<void> {
  requireAgent(ctx, agentId);
  let session = requireSession(ctx, agentId, sessionId);

  attachChatSse(res);
  let clientOpen = true;
  const ac = new AbortController();
  const stopHeartbeat = startSseHeartbeat(res, () => clientOpen);
  // 'close' also fires after a normal end, so this reclaims the heartbeat too.
  res.on('close', () => {
    clientOpen = false;
    stopHeartbeat();
    ac.abort();
  });

  const send = (event: string, data: unknown) => {
    if (!clientOpen) return;
    if (!writeSse(res, event, data)) clientOpen = false;
  };

  send('session', session);

  const finishWithAssistant = (message: Message | undefined, current: ChatSession) => {
    if (message) {
      send('done', {
        message,
        sessionId: current.claudeSessionId,
        chatSessionId: current.id,
      });
    }
    if (clientOpen && !res.writableEnded) res.end();
  };

  const healIdleStreaming = (current: ChatSession): Message | undefined => {
    const pid = current.pid;
    const live = Boolean(pid != null && isPidAlive(pid)) || Boolean(ctx.claude.getRunningProcess(current.id));
    if (current.status === 'running' || live) return undefined;
    const last = ctx.repos.messages.listBySession(current.id).at(-1);
    if (last?.role === 'assistant' && last.metadata?.streaming) {
      ctx.repos.messages.update({
        ...last,
        metadata: { ...last.metadata, streaming: false },
      });
    }
    const next = ctx.repos.messages.listBySession(current.id).at(-1);
    return next?.role === 'assistant' ? next : undefined;
  };

  if (session.status !== 'running') {
    const healed = healIdleStreaming(session);
    const last =
      healed ??
      [...ctx.repos.messages.listBySession(session.id)].reverse().find((item) => item.role === 'assistant');
    finishWithAssistant(last, session);
    return;
  }

  const handle = await resolveRunHandle(ctx, session.id);
  session = ctx.repos.sessions.getById(session.id) ?? session;
  send('session', session);

  if (ac.signal.aborted || !clientOpen) {
    if (!res.writableEnded) res.end();
    return;
  }

  if (!handle) {
    finishWithAssistant(
      (await waitForSettledAssistant(ctx, session.id)) ?? healIdleStreaming(session),
      ctx.repos.sessions.getById(session.id) ?? session,
    );
    return;
  }

  const messages = ctx.repos.messages.listBySession(session.id);
  for (const item of messages) {
    if (item.role === 'user') send('user_message', item);
  }

  let assistantMessage = [...messages].reverse().find((item) => item.role === 'assistant');
  let assistantText = assistantMessage?.content ?? '';
  let timeline: StreamPart[] = assistantMessage?.metadata.timeline ?? [];
  let parentClaudeSessionId: string | null = session.claudeSessionId;

  const applyEvent = (event: Record<string, unknown>, live: boolean) => {
    parentClaudeSessionId = adoptParentClaudeSessionId(parentClaudeSessionId, event);
    const token = parentStreamTextDelta(event, parentClaudeSessionId);
    if (token) {
      assistantText += token;
      timeline = appendStreamText(timeline, token);
      if (live) send('token', { text: token });
    } else if (String(event.type ?? '') !== 'stderr') {
      timeline = applyStreamEvent(timeline, event, parentClaudeSessionId);
      if (live) send('event', event);
    }
  };

  const snapshot = await readClaudeLogSnapshot(handle.logPath);
  assistantText = '';
  timeline = [];
  for (const line of snapshot.lines) {
    try {
      applyEvent(JSON.parse(line) as Record<string, unknown>, false);
    } catch {
      // ignore malformed historical lines
    }
  }

  if (assistantMessage) {
    assistantMessage = {
      ...assistantMessage,
      content: assistantText || assistantMessage.content,
      metadata: {
        ...assistantMessage.metadata,
        streaming: true,
        timeline: timeline.length > 0 ? timeline : assistantMessage.metadata.timeline,
      },
    };
    send('assistant_message', assistantMessage);
  }

  for (const pending of ctx.claude.listPendingPermissions(session.id)) {
    send('permission_request', {
      requestId: pending.requestId,
      toolName: pending.toolName,
      input: pending.input,
      toolUseId: pending.toolUseId,
      createdAt: nowIso(),
    });
  }

  try {
    await followClaudeLog(handle.pid, handle.logPath, (line) => {
      try {
        applyEvent(JSON.parse(line) as Record<string, unknown>, true);
      } catch {
        // ignore malformed live lines
      }
    }, { startPosition: snapshot.position, signal: ac.signal });
  } catch {
    // abort or log read failure — settle from DB below
  }

  if (ac.signal.aborted || !clientOpen) {
    if (!res.writableEnded) res.end();
    return;
  }

  const settled =
    (await waitForSettledAssistant(ctx, session.id)) ??
    healIdleStreaming(ctx.repos.sessions.getById(session.id) ?? session);
  finishWithAssistant(settled, ctx.repos.sessions.getById(session.id) ?? session);
}
