import { describe, expect, it } from 'vitest';
import { pullRequestPath } from './paths';

describe('pullRequestPath', () => {
  it('builds the in-app PR route', () => {
    expect(pullRequestPath('azweb76', 'agent-orchestrator', 88)).toBe(
      '/pull-requests/azweb76/agent-orchestrator/88',
    );
  });

  it('encodes owner and repo segments', () => {
    expect(pullRequestPath('some org', 'repo/with#chars', 1)).toBe(
      '/pull-requests/some%20org/repo%2Fwith%23chars/1',
    );
  });
});
