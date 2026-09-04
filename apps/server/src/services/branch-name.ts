import { sanitizeBranchName } from './anthropic.js';

/**
 * Resolve an explicit branch/worktree name from a create-agent request.
 * Returns null when the caller should auto-suggest (`undefined`, empty, or `"auto"`).
 */
export function resolveExplicitBranchName(requested?: string | null): string | null {
  const trimmed = requested?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === 'auto') return null;
  return sanitizeBranchName(trimmed);
}
