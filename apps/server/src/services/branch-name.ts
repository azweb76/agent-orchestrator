import { v4 as uuidv4 } from 'uuid';
import type { Workspace } from '@agent-orchestrator/shared';
import { sanitizeBranchName } from './anthropic.js';
import type { AppContext } from './app-context.js';

/**
 * Resolve an explicit branch/worktree name from a create-agent request.
 * Returns null when the caller should auto-suggest (`undefined`, empty, or `"auto"`).
 */
export function resolveExplicitBranchName(requested?: string | null): string | null {
  const trimmed = requested?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === 'auto') return null;
  return sanitizeBranchName(trimmed);
}

const MAX_UNIQUE_SUFFIX_ATTEMPTS = 50;

/**
 * Resolve a collision on an AI-suggested branch name by appending `-2`, `-3`, ...
 * No human chose this exact name, so we pick a free one automatically instead of
 * throwing `BranchExistsError` (unlike explicit user-typed branch names).
 */
export async function ensureUniqueBranchName(
  ctx: AppContext,
  workspace: Workspace,
  candidate: string,
): Promise<string> {
  if (!(await ctx.git.localBranchExists(workspace.repoPath, candidate))) {
    return candidate;
  }
  for (let i = 2; i <= MAX_UNIQUE_SUFFIX_ATTEMPTS; i++) {
    const attempt = `${candidate}-${i}`;
    if (!(await ctx.git.localBranchExists(workspace.repoPath, attempt))) {
      return attempt;
    }
  }
  return `${candidate}-${uuidv4().slice(0, 8)}`;
}
