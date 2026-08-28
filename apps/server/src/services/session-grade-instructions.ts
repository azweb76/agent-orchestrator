import { existsSync } from 'node:fs';
import type {
  ApplyInstructionFileRequest,
  ChatSession,
  GenerateInstructionDraftRequest,
  GradeChatSessionRequest,
  SessionContextUsage,
} from '@agent-orchestrator/shared';
import { buildSessionContextUsage } from '@agent-orchestrator/shared';
import { buildSessionTranscript } from './session-transcript.js';
import {
  applyInstructionFile,
  listInstructionFiles,
  loadInstructionFileExcerpts,
  readInstructionFileContent,
  type InstructionFileRoots,
} from './instruction-files.js';
import { buildSessionGradeContext } from './session-grade.js';
import { resolveClaudeSessionFilePath, readClaudeSessionFile, readClaudeSessionContext } from './claude-session-file.js';
import { discoverSlashCommands } from './slash-commands.js';
import { type AppContext, makeEvent, nowIso } from './app-context.js';
import { requireAgent, requireSession } from './agent-core.js';
import { getAppSettings } from './app-settings.js';

function instructionRoots(ctx: AppContext, agentId: string): InstructionFileRoots {
  const agent = requireAgent(ctx, agentId);
  const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
  if (!worktree) throw new Error('Worktree not found');
  return { worktreePath: worktree.path };
}

export async function gradeAgentSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  body: GradeChatSessionRequest = {},
): Promise<ChatSession> {
  if (!getAppSettings(ctx.repos).analyzeSessionEnabled) {
    throw new Error('Session analysis is disabled. Enable it in Settings.');
  }
  const session = requireSession(ctx, agentId, sessionId);
  const dbMessages = ctx.repos.messages.listBySession(session.id);
  const roots = instructionRoots(ctx, agentId);
  const sessionFilePath = resolveClaudeSessionFilePath({
    cwd: roots.worktreePath,
    sessionId: session.claudeSessionId,
    runLogPath: session.runLogPath,
  });

  let sourceMessages = dbMessages;
  let usageTokens: number | null = null;
  let fileCostUsd: number | null = null;
  if (sessionFilePath) {
    const parsed = await readClaudeSessionFile(sessionFilePath);
    sourceMessages = parsed.messages;
    usageTokens = parsed.usageTokens;
    fileCostUsd = parsed.costUsd;
  }

  const liveTranscript = buildSessionTranscript(sourceMessages);
  const storedTranscript = sessionFilePath
    ? ''
    : ctx.repos.sessions.getGradeTranscript(session.id);
  const transcript = liveTranscript || storedTranscript;
  if (!transcript) {
    throw new Error(
      sessionFilePath
        ? 'Cannot grade an empty session file.'
        : 'Cannot grade an empty session. Send a message first.',
    );
  }

  const [instructionFiles, skills] = await Promise.all([
    loadInstructionFileExcerpts(roots),
    discoverSlashCommands(roots.worktreePath),
  ]);

  const context = buildSessionGradeContext({
    messages: sourceMessages,
    instructionFiles,
    skills,
    sessionTitle: session.title,
    model: session.model,
    permissionMode: session.permissionMode,
    notes: body.notes,
    sessionFilePath,
    usageTokens,
    costUsd: fileCostUsd,
  });
  if (!context.transcript) {
    context.transcript = storedTranscript;
  }

  const result = await ctx.anthropic.analyzeSessionGrade(context);
  const graded = ctx.repos.sessions.setGrade(
    session.id,
    {
      score: result.score,
      comment: result.summary,
      gradedAt: nowIso(),
      analysis: {
        summary: result.summary,
        findings: result.findings,
        stats: result.stats,
        ...(sessionFilePath ? { sessionFilePath } : {}),
      },
    },
    context.transcript || transcript,
  );
  ctx.repos.events.create(
    makeEvent(agentId, 'session_graded', {
      sessionId: session.id,
      score: result.score,
    }),
  );
  return graded;
}

export async function listAgentInstructionFiles(ctx: AppContext, agentId: string) {
  requireAgent(ctx, agentId);
  return listInstructionFiles(instructionRoots(ctx, agentId));
}

export async function generateAgentInstructionDraft(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  body: GenerateInstructionDraftRequest,
) {
  const session = requireSession(ctx, agentId, sessionId);
  const messages = ctx.repos.messages.listBySession(session.id);
  const transcript =
    buildSessionTranscript(messages) || ctx.repos.sessions.getGradeTranscript(session.id);
  if (!transcript) {
    throw new Error('Cannot generate instructions from an empty session.');
  }

  const roots = instructionRoots(ctx, agentId);
  let existingContent: string | null = null;
  if (body.relativePath) {
    existingContent = await readInstructionFileContent(roots, {
      kind: body.kind,
      scope: body.scope ?? 'project',
      relativePath: body.relativePath,
    });
  }

  const draft = await ctx.anthropic.generateInstructionDraft({
    transcript,
    score: session.grade?.score ?? null,
    comment: session.grade?.comment ?? '',
    analysis: session.grade?.analysis ?? null,
    request: body,
    existingContent,
    existingPath: body.relativePath ?? null,
  });
  ctx.repos.events.create(
    makeEvent(agentId, 'instruction_draft_generated', {
      sessionId: session.id,
      kind: draft.kind,
      relativePath: draft.relativePath,
    }),
  );
  return draft;
}

export async function applyAgentInstructionFile(
  ctx: AppContext,
  agentId: string,
  body: ApplyInstructionFileRequest,
) {
  requireAgent(ctx, agentId);
  const result = await applyInstructionFile(instructionRoots(ctx, agentId), body);
  ctx.repos.events.create(
    makeEvent(agentId, 'instruction_file_applied', {
      kind: result.kind,
      relativePath: result.relativePath,
      action: result.action,
    }),
  );
  return result;
}

export async function getAgentSessionContext(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): Promise<SessionContextUsage> {
  const session = requireSession(ctx, agentId, sessionId);
  const roots = instructionRoots(ctx, agentId);
  const claudeSessionPath = resolveClaudeSessionFilePath({
    cwd: roots.worktreePath,
    sessionId: session.claudeSessionId,
    runLogPath: null,
  });
  const runLogPath =
    session.runLogPath?.trim() && existsSync(session.runLogPath.trim())
      ? session.runLogPath.trim()
      : null;

  const candidates = [...new Set([claudeSessionPath, runLogPath].filter(Boolean))] as string[];
  if (candidates.length === 0) {
    return buildSessionContextUsage({
      fallbackModel: session.model,
      history: [],
      sessionFilePath: null,
    });
  }

  let best = await readClaudeSessionContext(candidates[0]!);
  let bestPath: string | null = candidates[0]!;
  // Prefer a source that actually reports prompt occupancy. After stop, the Claude
  // JSONL can exist but still lack usage while the orchestrator run log has it.
  if (!best.history.some((turn) => turn.contextTokens > 0)) {
    for (const candidate of candidates.slice(1)) {
      const parsed = await readClaudeSessionContext(candidate);
      if (parsed.history.some((turn) => turn.contextTokens > 0)) {
        best = parsed;
        bestPath = candidate;
        break;
      }
    }
  }

  return buildSessionContextUsage({
    model: best.model,
    fallbackModel: session.model,
    history: best.history,
    billed: best.billed,
    costUsd: best.costUsd,
    sessionFilePath: bestPath,
  });
}
