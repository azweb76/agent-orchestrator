import { describe, expect, it } from 'vitest';
import { PULL_REQUEST_STATUS_LABELS, resolvePullRequestStatus } from './pullRequestStatus';

describe('resolvePullRequestStatus', () => {
  it('maps open / draft / merged / closed', () => {
    expect(resolvePullRequestStatus({ state: 'open', draft: false, merged: false })).toBe('open');
    expect(resolvePullRequestStatus({ state: 'open', draft: true, merged: false })).toBe('draft');
    expect(resolvePullRequestStatus({ state: 'closed', draft: false, merged: true })).toBe('merged');
    expect(resolvePullRequestStatus({ state: 'closed', draft: false, merged: false })).toBe('closed');
  });

  it('treats merged as merged even when state is open', () => {
    expect(resolvePullRequestStatus({ state: 'open', merged: true })).toBe('merged');
  });
});

describe('PULL_REQUEST_STATUS_LABELS', () => {
  it('covers every status kind', () => {
    expect(Object.keys(PULL_REQUEST_STATUS_LABELS).sort()).toEqual(
      ['closed', 'draft', 'merged', 'open'].sort(),
    );
  });
});
