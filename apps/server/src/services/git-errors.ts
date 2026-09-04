import { BRANCH_EXISTS_ERROR_CODE } from '@agent-orchestrator/shared';

/** Thrown when createNew would collide with an existing local branch. */
export class BranchExistsError extends Error {
  readonly code = BRANCH_EXISTS_ERROR_CODE;
  readonly status = 409;

  constructor(readonly branch: string) {
    super(`Branch "${branch}" already exists`);
    this.name = 'BranchExistsError';
  }
}
