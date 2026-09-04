import { describe, expect, it } from 'vitest';
import { AUTO_BRANCH_NAME, branchForCreateRequest } from './CreateWorktreeNameField';

describe('branchForCreateRequest', () => {
  it('omits Auto and empty values', () => {
    expect(branchForCreateRequest(AUTO_BRANCH_NAME)).toBeUndefined();
    expect(branchForCreateRequest('auto')).toBeUndefined();
    expect(branchForCreateRequest(' AUTO ')).toBeUndefined();
    expect(branchForCreateRequest('')).toBeUndefined();
    expect(branchForCreateRequest('   ')).toBeUndefined();
  });

  it('passes through an explicit branch name', () => {
    expect(branchForCreateRequest('feature/my-change')).toBe('feature/my-change');
    expect(branchForCreateRequest('  fix-login  ')).toBe('fix-login');
  });
});
