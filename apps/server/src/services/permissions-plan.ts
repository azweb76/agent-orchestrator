import type { Response } from 'express';
import type {
  AllowPermissionRequest,
  AnswerAskUserQuestionRequest,
  BuildPlanRequest,
  DenyPermissionRequest,
  PermissionRequest,
  ChatSession,
} from '@agent-orchestrator/shared';
import { buildImplementPlanPrompt, buildAskUserQuestionUpdatedInput, extractPlanFromInput } from '@agent-orchestrator/shared';
import fs from 'node:fs/promises';
import { enrichPermissionInput } from './git.js';
import { gatherPlanBuildHandoffContext } from './plan-handoff.js';
import { type AppContext, makeEvent, nowIso } from './app-context.js';
import { createSessionForAgent, requireAgent, requireSession } from './agent-core.js';
import { getAgentDetail } from './agents-lifecycle.js';
import { clearSessionQueue } from './chat-queue.js';
import { markStreamingAssistantStopped, stopClaudeRun } from './chat-run-lifecycle.js';
import { streamAgentChat } from './chat-stream.js';

function resolvePermissionSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string | undefined,
  requestId?: string,
): ChatSession {
  if (sessionId) return requireSession(ctx, agentId, sessionId);
  if (requestId) {
    for (const session of ctx.repos.sessions.listByAgent(agentId)) {
      if (ctx.claude.listPendingPermissions(session.id).some((item) => item.requestId === requestId)) {
        return session;
      }
    }
  }
  return requireSession(ctx, agentId);
}

export function listPendingPermissions(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): PermissionRequest[] {
  requireAgent(ctx, agentId);
  const session = requireSession(ctx, agentId, sessionId);
  return ctx.claude.listPendingPermissions(session.id).map((item) => ({
    requestId: item.requestId,
    toolName: item.toolName,
    input: item.input,
    toolUseId: item.toolUseId,
    createdAt: nowIso(),
  }));
}

export async function answerAskUserQuestion(
  ctx: AppContext,
  agentId: string,
  body: AnswerAskUserQuestionRequest,
  sessionId?: string,
): Promise<{ ok: true }> {
  requireAgent(ctx, agentId);
  const session = resolvePermissionSession(ctx, agentId, sessionId, body.requestId);

  const pending = ctx.claude
    .listPendingPermissions(session.id)
    .find((item) => item.requestId === body.requestId);
  if (!pending) throw new Error('Permission request not found');
  if (pending.toolName !== 'AskUserQuestion') {
    throw new Error('Permission request is not AskUserQuestion');
  }

  // Claude Code requires the original questions array plus answers (and optional
  // freeform response). Re-normalizing questions can break tool validation.
  const updatedInput = buildAskUserQuestionUpdatedInput(pending.input, {
    answers: body.answers,
    response: body.response,
  });

  const ok = ctx.claude.respondToPermission(session.id, body.requestId, {
    behavior: 'allow',
    updatedInput,
  });
  if (!ok) throw new Error('Failed to send answers to Claude');

  ctx.repos.events.create(
    makeEvent(agentId, 'ask_user_question_answered', {
      requestId: body.requestId,
      answers: body.answers,
      response: body.response ?? null,
      sessionId: session.id,
    }),
  );
  return { ok: true };
}

export async function allowPermissionRequest(
  ctx: AppContext,
  agentId: string,
  body: AllowPermissionRequest,
  sessionId?: string,
): Promise<{ ok: true }> {
  requireAgent(ctx, agentId);
  const session = resolvePermissionSession(ctx, agentId, sessionId, body.requestId);

  const pending = ctx.claude
    .listPendingPermissions(session.id)
    .find((item) => item.requestId === body.requestId);
  if (!pending) throw new Error('Permission request not found');
  if (pending.toolName === 'AskUserQuestion') {
    throw new Error('Use the answer endpoint for AskUserQuestion');
  }
  if (pending.toolName === 'ExitPlanMode') {
    throw new Error('Use Build to approve ExitPlanMode (avoids CLI stdio hang)');
  }

  const ok = ctx.claude.respondToPermission(session.id, body.requestId, {
    behavior: 'allow',
    updatedInput: body.updatedInput ?? pending.input,
  });
  if (!ok) throw new Error('Permission request not found or Claude stdin unavailable');

  ctx.repos.events.create(
    makeEvent(agentId, 'permission_allowed', {
      requestId: body.requestId,
      toolName: pending.toolName,
      sessionId: session.id,
    }),
  );
  return { ok: true };
}

export async function denyPermissionRequest(
  ctx: AppContext,
  agentId: string,
  body: DenyPermissionRequest,
  sessionId?: string,
): Promise<{ ok: true }> {
  requireAgent(ctx, agentId);
  const session = resolvePermissionSession(ctx, agentId, sessionId, body.requestId);

  const pending = ctx.claude
    .listPendingPermissions(session.id)
    .find((item) => item.requestId === body.requestId);

  const message = body.message?.trim() || 'User declined this request. Continue planning.';

  // ExitPlanMode deny via stdio hangs (deferred tool). Stop the run instead and
  // keep the Claude session so the user can continue planning with a follow-up.
  if (pending?.toolName === 'ExitPlanMode') {
    ctx.claude.dismissPermission(session.id, body.requestId);
    await stopClaudeRun(ctx, session);
    markStreamingAssistantStopped(ctx, agentId, session.id);
    ctx.repos.events.create(
      makeEvent(agentId, 'permission_denied', {
        requestId: body.requestId,
        message,
        toolName: pending.toolName,
        sessionId: session.id,
      }),
    );
    return { ok: true };
  }

  const ok = ctx.claude.respondToPermission(session.id, body.requestId, {
    behavior: 'deny',
    message,
  });
  if (!ok) throw new Error('Permission request not found or Claude stdin unavailable');

  ctx.repos.events.create(
    makeEvent(agentId, 'permission_denied', {
      requestId: body.requestId,
      message,
      sessionId: session.id,
    }),
  );
  return { ok: true };
}

async function resolvePlanText(
  ctx: AppContext,
  agentId: string,
  session: ChatSession,
  body: BuildPlanRequest,
): Promise<string> {
  if (body.plan?.trim()) return body.plan.trim();

  if (body.requestId) {
    const pending = ctx.claude
      .listPendingPermissions(session.id)
      .find((item) => item.requestId === body.requestId);
    if (pending) {
      const enriched = enrichPermissionInput('ExitPlanMode', pending.input, {
        logPath: ctx.claude.getRunningProcess(session.id)?.logPath ?? session.runLogPath ?? undefined,
      });
      const fromInput = extractPlanFromInput(enriched);
      if (fromInput) return fromInput;

      const planFilePath =
        typeof enriched.planFilePath === 'string' ? enriched.planFilePath : null;
      if (planFilePath) {
        try {
          const text = await fs.readFile(planFilePath, 'utf8');
          if (text.trim()) return text.trim();
        } catch {
          // fall through
        }
      }
    }
  }

  const messages = ctx.repos.messages.listBySession(session.id);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'assistant' && message.content.trim()) {
      return message.content.trim();
    }
  }

  throw new Error('No plan content available to build');
}

/**
 * Exit plan mode via Build: stash the current session, create a new auto-mode
 * session, and start implementing the approved plan there.
 */
export async function buildApprovedPlan(
  ctx: AppContext,
  agentId: string,
  body: BuildPlanRequest,
  res: Response | null,
  sessionId?: string,
): Promise<void> {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.archivedAt) throw new Error('Cannot build with archived agent');

  const planSession = resolvePermissionSession(ctx, agentId, sessionId, body.requestId);
  const plan = await resolvePlanText(ctx, agentId, planSession, body);
  const handoff = await gatherPlanBuildHandoffContext(ctx, agentId, planSession, plan);

  if (body.requestId) {
    ctx.claude.dismissPermission(planSession.id, body.requestId);
  }

  // Stop the in-flight plan-mode run (avoids ExitPlanMode stdio hang on approve)
  // but keep its messages and Claude session so the user can return to it.
  await stopClaudeRun(ctx, planSession);
  // Follow-ups queued on the plan session were meant for planning; drop them
  // so they do not fire at the stashed session once it goes idle.
  await clearSessionQueue(ctx, planSession.id);

  const agent = requireAgent(ctx, agentId);
  const buildSession = createSessionForAgent(ctx, agent, {
    template: 'build',
    permissionMode: 'auto',
    activate: true,
  });

  const { markAutopilotBuildHandoff } = await import('./autopilot.js');
  markAutopilotBuildHandoff(ctx, agentId);

  ctx.repos.events.create(
    makeEvent(agentId, 'plan_build_started', {
      requestId: body.requestId ?? null,
      planLength: plan.length,
      stashedSessionId: planSession.id,
      sessionId: buildSession.id,
    }),
  );

  await streamAgentChat(
    ctx,
    agentId,
    { message: buildImplementPlanPrompt(plan, handoff), force: true },
    res,
    buildSession.id,
    { createdSession: buildSession },
  );
}
