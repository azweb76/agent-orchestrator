import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import type {
  ChatMention,
  ChatRequest,
  ChatSession,
  Message,
  MessageAttachment,
  PermissionRequest,
} from '@agent-orchestrator/shared';
import {
  appendStreamText,
  applyStreamEvent,
  adoptParentClaudeSessionId,
  coalesceTimelineText,
  parentStreamTextDelta,
  type StreamPart,
} from '@agent-orchestrator/shared';
import { resolveChatMentions } from './chat-mentions.js';
import { resolveSlashCommandContext } from './slash-command-context.js';
import { type AppContext, makeEvent, nowIso, notify } from './app-context.js';
import {
  maybeAutoNameChatSession,
  persistSessionRuntime,
  requireAgent,
  requireSession,
  syncAgentFromSessions,
} from './agent-core.js';
import { getAgentDetail } from './agents-lifecycle.js';
import { resolveSessionSystemPrompt } from './agent-memory.js';
import {
  drainSessionQueue,
  enqueueBehindWorktreeLock,
  enqueueSpendCapBlocked,
  findRunningMutatingPeer,
  isGitMutatingSession,
} from './chat-queue.js';
import { attachChatSse, startSseHeartbeat } from './chat-sse.js';
import {
  finalizeSessionRun,
  markStreamingAssistantStopped,
  persistAssistantProgress,
  saveChatImages,
  stopClaudeRun,
} from './chat-run-lifecycle.js';
import { clearSessionRunFields } from './agent-core.js';
import { evaluateSpendCap } from './spend-cap.js';
import { refreshSessionSearchIndex } from './session-search-index.js';

export async function streamAgentChat(
  ctx: AppContext,
  agentId: string,
  body: ChatRequest,
  res: Response | null,
  sessionId?: string,
  options: {
    createdSession?: ChatSession;
    attachments?: MessageAttachment[];
    mentions?: ChatMention[];
  } = {},
) {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.archivedAt) {
    throw new Error('Cannot chat with archived agent');
  }

  const session = options.createdSession ?? requireSession(ctx, agentId, sessionId);

  const force = Boolean(body.force);
  const rawMessage = body.message.trim();
  const requestMentions = body.mentions ?? options.mentions ?? [];
  const hasImages = (body.images?.length ?? 0) > 0 || (options.attachments?.length ?? 0) > 0;
  const hasMentions = requestMentions.length > 0;

  const agent = requireAgent(ctx, agentId);
  const slash = await resolveSlashCommandContext(
    ctx,
    agent,
    detail.worktree.path,
    detail.workspace
      ? { githubOwner: detail.workspace.githubOwner, githubRepo: detail.workspace.githubRepo }
      : null,
    detail.worktree ? { branch: detail.worktree.branch } : null,
    rawMessage,
  );
  const activeSession = slash.sessionSwitch ?? session;
  if (slash.sessionSwitch && agent.activeSessionId !== slash.sessionSwitch.id) {
    ctx.repos.agents.update({
      ...agent,
      activeSessionId: slash.sessionSwitch.id,
      updatedAt: nowIso(),
    });
    syncAgentFromSessions(ctx, agentId);
  }

  const message = slash.handled ? slash.displayMessage : rawMessage;
  const claudePrompt = slash.handled ? slash.prompt : rawMessage;
  if (!message && !hasImages && !hasMentions) {
    throw new Error('Message or image attachment required');
  }

  // Check the in-process tracked run as well as the persisted pid: between
  // marking the session running and onStarted persisting the handle, the pid
  // is still null. Without this a concurrent send would slip past the guard,
  // persist a user message Claude never sees, and fail late in runStreaming.
  const hasActiveRun =
    Boolean(ctx.claude.getRunningProcess(activeSession.id)) ||
    (activeSession.status === 'running' && activeSession.pid != null);
  if (hasActiveRun) {
    if (!force) {
      throw new Error('Session already has a running Claude process. Queue the message or force-send.');
    }
    await stopClaudeRun(ctx, activeSession);
    markStreamingAssistantStopped(ctx, agentId, activeSession.id);
  }

  const latestForLock = ctx.repos.sessions.getById(activeSession.id) ?? activeSession;
  const mutatingPeer = findRunningMutatingPeer(
    ctx.repos.sessions.listByAgent(agentId),
    latestForLock.id,
  );
  const forceUnlockPeer = force && !options.createdSession;
  if (
    mutatingPeer &&
    isGitMutatingSession(latestForLock) &&
    !forceUnlockPeer &&
    !options.attachments
  ) {
    await enqueueBehindWorktreeLock(ctx, agentId, latestForLock, {
      message: rawMessage,
      images: body.images,
      mentions: body.mentions,
    }, res);
    return;
  }

  const spendBlock = evaluateSpendCap(ctx, agentId);
  if (spendBlock) {
    await enqueueSpendCapBlocked(
      ctx,
      agentId,
      latestForLock,
      {
        message: rawMessage,
        images: body.images,
        mentions: body.mentions,
      },
      spendBlock,
      res,
    );
    return;
  }

  // Reserve the session before any await below. Without this, two requests
  // arriving together can both observe an idle session while image files are
  // written and subsequently start overlapping Claude runs.
  let runningSession: ChatSession = {
    ...(ctx.repos.sessions.getById(activeSession.id) ?? activeSession),
    status: 'running',
    updatedAt: nowIso(),
  };
  runningSession = persistSessionRuntime(ctx, runningSession);
  syncAgentFromSessions(ctx, agentId);

  if (mutatingPeer && isGitMutatingSession(latestForLock) && forceUnlockPeer) {
    await stopClaudeRun(ctx, mutatingPeer);
    markStreamingAssistantStopped(ctx, agentId, mutatingPeer.id);
  }

  let attachments: MessageAttachment[];
  let mentionContext = slash.mentionContext?.trim() ?? '';
  try {
    attachments = options.attachments ?? (await saveChatImages(ctx, agentId, body.images));
    const mentionResult = await resolveChatMentions(ctx.git, detail.worktree.path, requestMentions);
    if (mentionResult.context.trim()) {
      mentionContext = mentionContext
        ? `${mentionContext}\n\n${mentionResult.context}`
        : mentionResult.context;
    }
  } catch (error) {
    ctx.repos.sessions.update(clearSessionRunFields(runningSession, { status: 'idle' }));
    syncAgentFromSessions(ctx, agentId);
    throw error;
  }

  const userMessage: Message = {
    id: uuidv4(),
    agentId,
    sessionId: activeSession.id,
    role: 'user',
    content: message || (hasMentions ? '(mention attachment)' : '(image attachment)'),
    attachments,
    metadata: {},
    createdAt: nowIso(),
  };
  ctx.repos.messages.create(userMessage);
  refreshSessionSearchIndex(ctx, activeSession.id);

  let assistantMessage: Message = {
    id: uuidv4(),
    agentId,
    sessionId: activeSession.id,
    role: 'assistant',
    content: '',
    attachments: [],
    metadata: { streaming: true, timeline: [] },
    createdAt: nowIso(),
  };
  ctx.repos.messages.create(assistantMessage);

  let clientOpen = res != null;
  let stopHeartbeat = () => {};
  if (res) {
    attachChatSse(res);
    res.on('close', () => {
      clientOpen = false;
    });
    stopHeartbeat = startSseHeartbeat(res, () => clientOpen);
  }

  const send = (event: string, data: unknown) => {
    if (!res || !clientOpen || res.writableEnded) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clientOpen = false;
    }
  };

  send('session', activeSession);
  send('user_message', userMessage);
  send('assistant_message', assistantMessage);

  const titleTask = maybeAutoNameChatSession(ctx, activeSession, userMessage.content)
    .then((named) => {
      if (named && named.title !== activeSession.title) {
        send('session', named);
      }
      return named;
    })
    .catch(() => null);

  send('session', runningSession);

  let assistantText = '';
  let timeline: StreamPart[] = [];
  let lastPersistAt = 0;
  const startedAt = Date.now();
  let parentClaudeSessionId: string | null = runningSession.claudeSessionId;

  const flushProgress = (forcePersist = false) => {
    const now = Date.now();
    if (!forcePersist && now - lastPersistAt < 300) return;
    lastPersistAt = now;
    assistantMessage = persistAssistantProgress(ctx, assistantMessage, assistantText, timeline);
  };

  try {
    const result = await ctx.claude.runStreaming(runningSession.id, {
      cwd: detail.worktree.path,
      prompt: claudePrompt,
      model: runningSession.model,
      effort: runningSession.effort,
      permissionMode: runningSession.permissionMode,
      sessionId: runningSession.claudeSessionId,
      allowedTools: runningSession.allowedTools ?? undefined,
      systemPrompt: resolveSessionSystemPrompt(ctx, agentId, runningSession.systemPrompt),
      imagePaths: attachments.map((item) => item.path),
      mentionContext,
      onStarted: (handle) => {
        runningSession = persistSessionRuntime(ctx, {
          ...runningSession,
          pid: handle.pid,
          runLogPath: handle.logPath,
          updatedAt: nowIso(),
        });
        syncAgentFromSessions(ctx, agentId);
      },
      onPermissionRequest: (request) => {
        const payload: PermissionRequest = {
          requestId: request.requestId,
          toolName: request.toolName,
          input: request.input,
          toolUseId: request.toolUseId,
          createdAt: nowIso(),
        };
        ctx.repos.events.create(
          makeEvent(agentId, 'permission_request', {
            ...payload,
            sessionId: runningSession.id,
          } as unknown as Record<string, unknown>),
        );
        notify(ctx, 'permission_request', {
          agentId,
          sessionId: runningSession.id,
          data: { requestId: request.requestId, toolName: request.toolName },
        });
        send('permission_request', payload);
        void import('./autopilot.js').then(({ maybeAutopilotOnExitPlanMode }) =>
          maybeAutopilotOnExitPlanMode(ctx, agentId, runningSession, payload),
        );
      },
      onEvent: (event) => {
        const record = event as Record<string, unknown>;
        parentClaudeSessionId = adoptParentClaudeSessionId(parentClaudeSessionId, record);
        const token = parentStreamTextDelta(record, parentClaudeSessionId);
        if (token) {
          timeline = appendStreamText(timeline, token);
          assistantText = coalesceTimelineText(timeline);
          flushProgress();
          send('token', { text: token });
        } else if (event.type !== 'stderr') {
          timeline = applyStreamEvent(timeline, record, parentClaudeSessionId);
          flushProgress(true);
          ctx.repos.events.create(makeEvent(agentId, event.type, record));
          send('event', event);
        }
      },
    });

    flushProgress(true);
    const finalized = finalizeSessionRun(
      ctx,
      runningSession,
      result,
      assistantText,
      {
        durationMs: Date.now() - startedAt,
        stopped: result.stopped,
        timeline,
      },
      {
        assistantMessageId: assistantMessage.id,
        runLogPath: runningSession.runLogPath,
      },
    );
    send('done', { message: finalized, sessionId: result.sessionId, chatSessionId: runningSession.id });
  } catch (error) {
    const current = ctx.repos.sessions.getById(runningSession.id) ?? runningSession;
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    flushProgress(true);

    if (assistantText.trim() || timeline.length > 0) {
      const partial = finalizeSessionRun(
        ctx,
        runningSession,
        { result: assistantText, sessionId: runningSession.claudeSessionId, stopped: true },
        assistantText,
        {
          error: errMessage,
          stopped: true,
          durationMs: Date.now() - startedAt,
          timeline,
        },
        {
          assistantMessageId: assistantMessage.id,
          runLogPath: runningSession.runLogPath,
        },
      );
      send('done', {
        message: partial,
        sessionId: current.claudeSessionId,
        chatSessionId: runningSession.id,
      });
    } else {
      if (ctx.repos.messages.getById(agentId, assistantMessage.id)) {
        ctx.repos.messages.deleteFrom(agentId, assistantMessage.id);
      }
      if (
        current.runLogPath === runningSession.runLogPath ||
        (runningSession.pid != null && current.pid === runningSession.pid)
      ) {
        ctx.repos.sessions.update(clearSessionRunFields(current, { status: 'idle' }));
        syncAgentFromSessions(ctx, agentId);
      }
      send('error', { message: errMessage });
    }
  } finally {
    stopHeartbeat();
    await titleTask;
    if (res && clientOpen && !res.writableEnded) {
      res.end();
    }
    // Deliver any follow-ups queued while this run was busy.
    void drainSessionQueue(ctx, agentId, session.id);
  }
}
