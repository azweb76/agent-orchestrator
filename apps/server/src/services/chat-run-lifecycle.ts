import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatImageAttachment,
  ChatSession,
  MessageAttachment,
} from '@agent-orchestrator/shared';
import {
  appendStreamText,
  applyStreamEvent,
  adoptParentClaudeSessionId,
  parentStreamTextDelta,
  type StreamPart,
} from '@agent-orchestrator/shared';
import { isPidAlive } from './git.js';
import { type AppContext, makeEvent, nowIso, notify } from './app-context.js';
import { clearSessionRunFields, syncAgentFromSessions } from './agent-core.js';
import {
  clearSessionQueue,
  drainSessionQueue,
  drainWaitingMutatingSessions,
  isGitMutatingSession,
} from './chat-queue.js';
import { sleep } from './chat-sse.js';
import {
  finalizeSessionRun,
  markStreamingAssistantStopped,
  persistAssistantProgress,
} from './chat-finalize.js';

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export async function saveChatImages(
  ctx: AppContext,
  agentId: string,
  images: ChatImageAttachment[] | undefined,
): Promise<MessageAttachment[]> {
  if (!images?.length) return [];

  const dir = path.join(ctx.dataDir, 'attachments', agentId);
  await fs.mkdir(dir, { recursive: true });

  const saved: MessageAttachment[] = [];
  for (const image of images) {
    if (!ALLOWED_IMAGE_MIME.has(image.mimeType)) {
      throw new Error(`Unsupported image type: ${image.mimeType}`);
    }
    if (!image.dataBase64 || image.dataBase64.length > 8_000_000) {
      throw new Error('Image payload is missing or too large (max ~6MB decoded)');
    }

    const id = uuidv4();
    const ext = extensionForMime(image.mimeType);
    const filePath = path.join(dir, `${id}.${ext}`);
    await fs.writeFile(filePath, Buffer.from(image.dataBase64, 'base64'));

    saved.push({
      id,
      type: 'image',
      mimeType: image.mimeType,
      name: image.name || `image.${ext}`,
      path: filePath,
      url: `/api/agents/${agentId}/attachments/${id}`,
    });
  }
  return saved;
}

/**
 * Stop a Claude run and wait until the OS process is gone.
 * Used by Build / Keep planning so a hung ExitPlanMode stdio wait cannot leak.
 */
export async function stopClaudeRun(ctx: AppContext, session: ChatSession): Promise<void> {
  // Prefer the tracked process pid — the session row may not have one yet
  // (stop can race the startup window before onStarted persists the handle).
  const pid = ctx.claude.getRunningProcess(session.id)?.pid ?? session.pid;
  ctx.claude.stop(session.id, session.pid, session.runLogPath);
  if (pid == null) {
    const afterStop = ctx.repos.sessions.getById(session.id);
    if (afterStop && (afterStop.status === 'running' || afterStop.pid != null)) {
      ctx.repos.sessions.update(clearSessionRunFields(afterStop, { status: 'idle' }));
      syncAgentFromSessions(ctx, session.agentId);
    }
    return;
  }

  const deadline = Date.now() + 5_000;
  while (isPidAlive(pid) && Date.now() < deadline) {
    await sleep(100);
  }
  await sleep(150);
  const afterStop = ctx.repos.sessions.getById(session.id);
  if (afterStop && (afterStop.status === 'running' || afterStop.pid != null)) {
    ctx.repos.sessions.update(clearSessionRunFields(afterStop, { status: 'idle' }));
    syncAgentFromSessions(ctx, session.agentId);
  }
}

export function recoverRunningAgents(ctx: AppContext): void {
  const running = ctx.repos.sessions.listRunning();
  const runningIds = new Set(running.map((session) => session.id));
  for (const session of running) {
    void recoverOneSession(ctx, session).then(
      () => drainSessionQueue(ctx, session.agentId, session.id),
      () => undefined,
    );
  }
  // Queued messages left behind by a previous process (e.g. the app was
  // restarted after a run finished but before the queue drained).
  const mutatingAgents = new Set<string>();
  for (const sessionId of ctx.repos.queued.listSessionIdsWithQueued()) {
    if (runningIds.has(sessionId)) continue;
    const session = ctx.repos.sessions.getById(sessionId);
    if (!session) continue;
    if (isGitMutatingSession(session)) {
      mutatingAgents.add(session.agentId);
      continue;
    }
    void drainSessionQueue(ctx, session.agentId, sessionId);
  }
  for (const agentId of mutatingAgents) {
    void drainWaitingMutatingSessions(ctx, agentId);
  }
}

async function recoverOneSession(ctx: AppContext, session: ChatSession): Promise<void> {
  if (session.pid == null || !session.runLogPath) {
    markStreamingAssistantStopped(ctx, session.agentId, session.id);
    ctx.repos.sessions.update(clearSessionRunFields(session, { status: 'idle' }));
    syncAgentFromSessions(ctx, session.agentId);
    return;
  }

  const messages = ctx.repos.messages.listBySession(session.id);
  let assistantMessage = messages[messages.length - 1];
  if (assistantMessage?.role !== 'assistant') {
    assistantMessage = {
      id: uuidv4(),
      agentId: session.agentId,
      sessionId: session.id,
      role: 'assistant',
      content: '',
      attachments: [],
      metadata: { streaming: true, timeline: [] },
      createdAt: nowIso(),
    };
    ctx.repos.messages.create(assistantMessage);
  }

  let assistantText = '';
  let timeline: StreamPart[] = [];
  let lastPersistAt = 0;
  let parentClaudeSessionId: string | null = session.claudeSessionId;

  const flushProgress = (forcePersist = false) => {
    const now = Date.now();
    if (!forcePersist && now - lastPersistAt < 300) return;
    lastPersistAt = now;
    if (!assistantMessage) return;
    assistantMessage = persistAssistantProgress(ctx, assistantMessage, assistantText, timeline);
  };

  const onEvent = (
    event: {
      type: string;
      event?: { delta?: { type?: string; text?: string } };
    },
    meta?: { replay?: boolean },
  ) => {
    const record = event as Record<string, unknown>;
    parentClaudeSessionId = adoptParentClaudeSessionId(parentClaudeSessionId, record);
    const token = parentStreamTextDelta(record, parentClaudeSessionId);
    if (token) {
      assistantText += token;
      timeline = appendStreamText(timeline, token);
      flushProgress();
    } else if (event.type !== 'stderr') {
      timeline = applyStreamEvent(timeline, record, parentClaudeSessionId);
      flushProgress(true);
      if (!meta?.replay) {
        ctx.repos.events.create(
          makeEvent(session.agentId, event.type, record),
        );
      }
    }
  };

  const onPermissionRequest = (request: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    toolUseId?: string;
  }) => {
    const payload = {
      requestId: request.requestId,
      toolName: request.toolName,
      input: request.input,
      toolUseId: request.toolUseId,
      createdAt: nowIso(),
    };
    const already = ctx.repos.events.listByAgent(session.agentId).some(
      (item) =>
        item.type === 'permission_request' &&
        String(item.data.requestId ?? '') === request.requestId,
    );
    if (!already) {
      ctx.repos.events.create(
        makeEvent(session.agentId, 'permission_request', payload as unknown as Record<string, unknown>),
      );
      notify(ctx, 'permission_request', {
        agentId: session.agentId,
        sessionId: session.id,
        data: { requestId: request.requestId, toolName: request.toolName },
      });
    }
  };

  if (!isPidAlive(session.pid)) {
    try {
      const result = await ctx.claude.attachToRun(
        session.id,
        { pid: session.pid, logPath: session.runLogPath },
        {
          sessionId: session.claudeSessionId,
          permissionMode: session.permissionMode,
          onEvent,
        },
      );
      flushProgress(true);
      finalizeSessionRun(ctx, session, result, assistantText, { timeline }, {
        assistantMessageId: assistantMessage.id,
        runLogPath: session.runLogPath,
      });
    } catch {
      markStreamingAssistantStopped(ctx, session.agentId, session.id);
      ctx.repos.sessions.update(clearSessionRunFields(session, { status: 'idle' }));
      syncAgentFromSessions(ctx, session.agentId);
    }
    return;
  }

  try {
    const result = await ctx.claude.attachToRun(
      session.id,
      { pid: session.pid, logPath: session.runLogPath },
      {
        sessionId: session.claudeSessionId,
        permissionMode: session.permissionMode,
        onEvent,
        onPermissionRequest,
        onCatchUp: () => flushProgress(true),
      },
    );
    flushProgress(true);
    finalizeSessionRun(ctx, session, result, assistantText, { timeline }, {
      assistantMessageId: assistantMessage.id,
      runLogPath: session.runLogPath,
    });
  } catch (error) {
    console.error(`Failed to recover session ${session.id}:`, error);
    markStreamingAssistantStopped(ctx, session.agentId, session.id);
    ctx.repos.sessions.update(clearSessionRunFields(session, { status: 'idle' }));
    syncAgentFromSessions(ctx, session.agentId);
  }
}

export async function cleanupMessageAttachments(messages: import('@agent-orchestrator/shared').Message[]): Promise<void> {
  const { cleanupQueuedAttachments } = await import('./chat-queue.js');
  await cleanupQueuedAttachments(messages.flatMap((message) => message.attachments ?? []));
}

export { finalizeSessionRun, markStreamingAssistantStopped, persistAssistantProgress };
