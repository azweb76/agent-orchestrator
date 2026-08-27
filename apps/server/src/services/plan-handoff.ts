import fs from 'node:fs/promises';
import type { AgentEvent, ChatSession, PlanBuildHandoffContext } from '@agent-orchestrator/shared';
import {
  buildPlanQaPairsFromAskUserAnswer,
  collectPlanHandoffFilePaths,
  extractAskUserQuestionPairsFromLog,
  mergeUniquePlanQaPairs,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app.js';

function eventSessionId(event: AgentEvent): string | null {
  const sessionId = event.data.sessionId;
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
}

/** Answered AskUserQuestion pairs from persisted permission events for one session. */
export function extractAskUserQuestionPairsFromEvents(
  events: AgentEvent[],
  sessionId: string,
): ReturnType<typeof buildPlanQaPairsFromAskUserAnswer> {
  const pendingByRequest = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    if (event.type !== 'permission_request') continue;
    if (eventSessionId(event) !== sessionId) continue;
    if (event.data.toolName !== 'AskUserQuestion') continue;
    const requestId = String(event.data.requestId ?? '');
    if (!requestId) continue;
    const input = event.data.input;
    pendingByRequest.set(
      requestId,
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {},
    );
  }

  const pairs: ReturnType<typeof buildPlanQaPairsFromAskUserAnswer> = [];
  for (const event of events) {
    if (event.type !== 'ask_user_question_answered') continue;
    if (eventSessionId(event) !== sessionId) continue;
    const requestId = String(event.data.requestId ?? '');
    const pendingInput = pendingByRequest.get(requestId) ?? {};
    const answers =
      event.data.answers && typeof event.data.answers === 'object' && !Array.isArray(event.data.answers)
        ? (event.data.answers as Record<string, string>)
        : {};
    const response = typeof event.data.response === 'string' ? event.data.response : undefined;
    pairs.push(...buildPlanQaPairsFromAskUserAnswer(pendingInput, answers, response));
  }
  return pairs;
}

async function readLogText(logPath: string | null | undefined): Promise<string> {
  if (!logPath?.trim()) return '';
  try {
    return await fs.readFile(logPath, 'utf8');
  } catch {
    return '';
  }
}

/** Gather plan-session Q&A and mentioned file paths for the Build kickoff prompt. */
export async function gatherPlanBuildHandoffContext(
  ctx: AppContext,
  agentId: string,
  planSession: ChatSession,
  plan: string,
): Promise<PlanBuildHandoffContext> {
  const runLogPath =
    ctx.claude.getRunningProcess(planSession.id)?.logPath ?? planSession.runLogPath ?? null;
  const logText = await readLogText(runLogPath);
  const messages = ctx.repos.messages.listBySession(planSession.id);
  const messageTexts = messages.map((message) => message.content).filter(Boolean);
  const events = ctx.repos.events.listByAgent(agentId);

  const qaPairs = mergeUniquePlanQaPairs([
    extractAskUserQuestionPairsFromLog(logText),
    extractAskUserQuestionPairsFromEvents(events, planSession.id),
  ]);
  const filePaths = collectPlanHandoffFilePaths(plan, qaPairs, logText, messageTexts);

  const context: PlanBuildHandoffContext = {};
  if (qaPairs.length > 0) context.qaPairs = qaPairs;
  if (filePaths.length > 0) context.filePaths = filePaths;
  return context;
}
