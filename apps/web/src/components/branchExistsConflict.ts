import { BRANCH_EXISTS_ERROR_CODE } from '@agent-orchestrator/shared';

export type ApiRequestError = Error & {
  status?: number;
  code?: string;
  branch?: string;
  authRequired?: boolean;
};

/** True when create-agent failed because the new branch name already exists locally. */
export function getBranchExistsConflict(error: unknown): { branch: string } | null {
  if (!error || typeof error !== 'object') return null;
  const err = error as ApiRequestError;
  if (err.code !== BRANCH_EXISTS_ERROR_CODE) return null;
  const branch = typeof err.branch === 'string' && err.branch.trim() ? err.branch.trim() : null;
  if (!branch) return null;
  return { branch };
}
