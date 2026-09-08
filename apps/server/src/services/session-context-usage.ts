import { existsSync } from 'node:fs';
import {
  addAttributionChars,
  buildSessionContextUsage,
  emptyAttributionChars,
  formatMemoriesForSystemPrompt,
  type ContextAttributionChars,
  type SessionContextUsage,
} from '@agent-orchestrator/shared';
import { type AppContext } from './app-context.js';
import { requireAgent, requireSession } from './agent-core.js';
import { listActiveMemoriesForPrompt } from './agent-memory.js';
import { resolveClaudeSessionFilePath, readClaudeSessionContext } from './claude-session-file.js';
import {
  loadInstructionFileExcerpts,
  type InstructionFileRoots,
} from './instruction-files.js';

function instructionRoots(ctx: AppContext, agentId: string): InstructionFileRoots {
  const agent = requireAgent(ctx, agentId);
  const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
  if (!worktree) throw new Error('Worktree not found');
  return { worktreePath: worktree.path };
}

function instructionCharsOf(files: Array<{ exists: boolean; charCount: number }>): number {
  return files.filter((file) => file.exists).reduce((sum, file) => sum + file.charCount, 0);
}

function memoryCharsForAgent(ctx: AppContext, agentId: string): number {
  try {
    return formatMemoriesForSystemPrompt(listActiveMemoriesForPrompt(ctx, agentId)).length;
  } catch {
    return 0;
  }
}

export function mergePromptAttribution(
  ctx: AppContext,
  agentId: string,
  jsonlChars: ContextAttributionChars | undefined,
  instructionFiles: Array<{ exists: boolean; charCount: number }>,
): ContextAttributionChars {
  return addAttributionChars(jsonlChars ?? emptyAttributionChars(), {
    instruction_files: instructionCharsOf(instructionFiles),
    memory: memoryCharsForAgent(ctx, agentId),
  });
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
      branches: [],
      sessionFilePath: null,
    });
  }

  let best = await readClaudeSessionContext(candidates[0]!);
  let bestPath: string | null = candidates[0]!;
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
    branches: best.branches,
    sessionFilePath: bestPath,
    attributionChars: mergePromptAttribution(
      ctx,
      agentId,
      best.attributionChars,
      await loadInstructionFileExcerpts(roots).catch(() => []),
    ),
  });
}
