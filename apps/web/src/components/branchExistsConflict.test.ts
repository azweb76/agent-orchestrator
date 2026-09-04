import { describe, expect, it } from 'vitest';
import { BRANCH_EXISTS_ERROR_CODE } from '@agent-orchestrator/shared';
import { getBranchExistsConflict } from './branchExistsConflict';

describe('getBranchExistsConflict', () => {
  it('returns the branch when the API reports BRANCH_EXISTS', () => {
    const error = Object.assign(new Error('Branch "feat/x" already exists'), {
      code: BRANCH_EXISTS_ERROR_CODE,
      branch: 'feat/x',
      status: 409,
    });
    expect(getBranchExistsConflict(error)).toEqual({ branch: 'feat/x' });
  });

  it('returns null for unrelated errors', () => {
    expect(getBranchExistsConflict(new Error('boom'))).toBeNull();
    expect(getBranchExistsConflict(null)).toBeNull();
  });
});
