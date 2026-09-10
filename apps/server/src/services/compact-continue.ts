import fs from 'node:fs/promises';
import type { Response } from 'express';
import type { ChatSession } from '@agent-orchestrator/shared';
import { buildCompactContinuePrompt, uniqueSessionTitle } from '@agent-orchestrator/shared';
import { collectCompactFilePaths, parseCompactLearnResponse } from './compact-session.js';
import {
  getInstructionDraftOffer,
  publishInstructionDraftOffer,
} from './instruction-offers.js';
import { requireAgentTaskByName } from './agent-tasks.js';
import { nowIso } from './app-context.js';
import {
  createSessionForAgent,
  getAgentDetail,
  makeEvent,
  requireAgent,
  requireSession,
  stopClaudeRun,
  streamAgentChat,
  type AppContext,
} from './app.js';
import { clearSessionQueue } from './chat-queue.js';
import { buildSessionTranscript } from './session-transcript.js';

async function readLogText(logPath: string | null | undefined): Promise<string> {
  if (!logPath?.trim()) return '';
  try {
    return await fs.readFile(logPath, 'utf8');
  } catch {
    return '';
  }
}

function continuationTitle(ctx: AppContext, session: ChatSession): string {
  const siblings = ctx.repos.sessions
    .listByAgent(session.agentId)
    .map((item) => item.title);
  const base = session.title.replace(/ \(continued(?: \d+)?\)$/, '');
  return uniqueSessionTitle(siblings, `${base} (continued)`);
}

/**
 * Compact-and-continue: summarize the session, stash it (transcript and Claude
 * session untouched — never a silent /clear), and start a fresh session seeded
 * with the summary and the files in play, keeping the same permission mode,
 * model, and effort. Only called after explicit user confirmation in the UI.
 */
export async function compactAndContinueSession(
  ctx: AppContext,
  agentId: string,
  res: Response,
  sessionId?: string,
): Promise<void> {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.archivedAt) throw new Error('Cannot compact chat for archived agent');

  const session = requireSession(ctx, agentId, sessionId);
  const messages = ctx.repos.messages.listBySession(session.id);
  const transcript = buildSessionTranscript(messages);
  if (!transcript.trim()) {
    throw new Error('Nothing to compact yet — the session has no messages');
  }

  // Summarize before touching the session so a failure leaves everything as is.
  const rawSummary = await ctx.anthropic.summarizeSessionForContinuation({
    title: session.title,
    transcript,
  });
  const { summary, lessons } = parseCompactLearnResponse(rawSummary);

  const runLogPath =
    ctx.claude.getRunningProcess(session.id)?.logPath ?? session.runLogPath ?? null;
  const logText = await readLogText(runLogPath);
  const filePaths = collectCompactFilePaths(
    logText,
    messages.map((message) => message.content).filter(Boolean),
  );

  // Stash the hot session: stop its run but keep its messages and Claude
  // session so the user can return to it. Queued follow-ups were written
  // against the old context; drop them so they cannot fire on the stashed
  // session once it goes idle.
  await stopClaudeRun(ctx, session);
  await clearSessionQueue(ctx, session.id);

  const agent = requireAgent(ctx, agentId);
  const created = createSessionForAgent(ctx, agent, {
    template: session.template,
    permissionMode: session.permissionMode,
    title: continuationTitle(ctx, session),
    activate: true,
  });
  // Carry the stashed session's model/effort (they may differ from agent defaults).
  const continuation = ctx.repos.sessions.update({
    ...created,
    model: session.model,
    effort: session.effort,
    updatedAt: new Date().toISOString(),
  });

  ctx.repos.events.create(
    makeEvent(agentId, 'session_compacted', {
      stashedSessionId: session.id,
      sessionId: continuation.id,
      summaryLength: summary.length,
      fileCount: filePaths.length,
      lessonCount: lessons.length,
    }),
  );

  if (lessons.length > 0 && !getInstructionDraftOffer(ctx, agentId)) {
    publishInstructionDraftOffer(ctx, agentId, {
      sessionId: session.id,
      gradedAt: nowIso(),
      findingTitles: lessons.slice(0, 5),
      kind: 'skill',
      scope: 'personal',
      extraNotes: lessons.map((lesson) => `- ${lesson}`).join('\n'),
      draft: null,
    });
  }

  const compactTask = requireAgentTaskByName(ctx, 'compact-continue');
  await streamAgentChat(
    ctx,
    agentId,
    {
      message: buildCompactContinuePrompt(summary, filePaths, lessons, compactTask.promptTemplate),
      force: true,
    },
    res,
    continuation.id,
    { createdSession: continuation },
  );
}
