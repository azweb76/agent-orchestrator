import type {
  CreateAiReadinessAgentRequest,
  WorkspaceAiReadiness,
  WorkspaceAiReadinessCache,
} from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';
import { createWorktreeFromGoal } from './worktrees.js';
import { getWorkspace } from './workspaces.js';
import {
  buildDeterministicChecks,
  buildImplementGoal,
  loadInstructionSnapshot,
  scoreChecks,
} from './workspace-ai-readiness-checks.js';
import {
  buildAiReadinessLlmPrompt,
  parseAiReadinessLlmResponse,
} from './workspace-ai-readiness-llm.js';

function cacheKey(workspaceId: string): string {
  return `workspace-ai-readiness:${workspaceId}`;
}

function readCachedReadiness(
  ctx: AppContext,
  workspaceId: string,
): WorkspaceAiReadiness | null {
  const raw = ctx.repos.automationState.get(cacheKey(workspaceId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WorkspaceAiReadiness;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.checks)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedReadiness(
  ctx: AppContext,
  workspaceId: string,
  readiness: WorkspaceAiReadiness,
): void {
  ctx.repos.automationState.set(cacheKey(workspaceId), JSON.stringify(readiness));
}

async function runLlmAdvice(
  ctx: AppContext,
  readinessBase: Omit<WorkspaceAiReadiness, 'llm' | 'llmError'>,
  snapshot: Awaited<ReturnType<typeof loadInstructionSnapshot>>,
): Promise<{ llm: WorkspaceAiReadiness['llm']; llmError: string | null }> {
  try {
    const { system, user } = buildAiReadinessLlmPrompt({
      defaultBranch: readinessBase.defaultBranch,
      analyzedRef: readinessBase.analyzedRef,
      checks: readinessBase.checks,
      snapshot,
    });
    const raw = await ctx.anthropic.completeJsonAdvice({ system, user });
    return { llm: parseAiReadinessLlmResponse(raw), llmError: null };
  } catch (err) {
    return {
      llm: null,
      llmError: err instanceof Error ? err.message : 'LLM analysis unavailable',
    };
  }
}

/** Return the cached AI readiness result, or null if the user has not run analysis yet. */
export async function getCachedWorkspaceAiReadiness(
  ctx: AppContext,
  workspaceId: string,
): Promise<WorkspaceAiReadinessCache> {
  await getWorkspace(ctx, workspaceId);
  return { readiness: readCachedReadiness(ctx, workspaceId) };
}

/** Analyze default-branch AI readiness and persist the result for later views. */
export async function analyzeWorkspaceAiReadiness(
  ctx: AppContext,
  workspaceId: string,
): Promise<WorkspaceAiReadiness> {
  const workspace = await getWorkspace(ctx, workspaceId);
  await ctx.git.fetch(workspace.repoPath);

  const analyzedRef = `origin/${workspace.defaultBranch}`;
  const analyzedSha = await ctx.git.resolveSha(workspace.repoPath, analyzedRef);
  if (!analyzedSha) {
    throw new Error(`Remote ref ${analyzedRef} not found — fetch the default branch first`);
  }

  const snapshot = await loadInstructionSnapshot(ctx.git, workspace.repoPath, analyzedRef);
  const checks = buildDeterministicChecks(snapshot);
  const { score, maxScore } = scoreChecks(checks);

  const base = {
    defaultBranch: workspace.defaultBranch,
    analyzedRef,
    analyzedSha,
    score,
    maxScore,
    checks,
    files: snapshot.files,
    skillPaths: snapshot.skillPaths,
    checkedAt: nowIso(),
  };

  const { llm, llmError } = await runLlmAdvice(ctx, base, snapshot);
  const readiness = { ...base, llm, llmError };
  writeCachedReadiness(ctx, workspaceId, readiness);
  return readiness;
}

/** Create a from-goal agent whose kickoff prompt implements AI readiness findings. */
export async function createAiReadinessAgent(
  ctx: AppContext,
  workspaceId: string,
  body: CreateAiReadinessAgentRequest = {},
) {
  const readiness =
    readCachedReadiness(ctx, workspaceId) ??
    (await analyzeWorkspaceAiReadiness(ctx, workspaceId));
  const goal = buildImplementGoal(readiness, body.checkIds);
  const workspace = await getWorkspace(ctx, workspaceId);

  const created = await createWorktreeFromGoal(ctx, workspaceId, {
    goal,
    name: body.name ?? 'ai-readiness',
    branch: body.branch,
    baseBranch: workspace.defaultBranch,
    task: body.task?.trim() || 'auto',
    model: body.model,
    effort: body.effort,
    overwrite: body.overwrite,
  });

  return { ...created, readiness, goal };
}
