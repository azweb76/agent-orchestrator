import { describe, expect, it } from 'vitest';
import { EMPTY_BRAIN_SYNC_STATUS } from '@agent-orchestrator/shared';
import { brainSyncHeadline } from './brainSync';

describe('brainSyncHeadline', () => {
  it('describes an unconnected library', () => {
    expect(brainSyncHeadline(EMPTY_BRAIN_SYNC_STATUS)).toBe('Not connected');
  });

  it('describes modified, behind, and up to date states', () => {
    const base = {
      ...EMPTY_BRAIN_SYNC_STATUS,
      configured: true,
      githubOwner: 'acme',
      githubRepo: 'brain',
      repoUrl: 'https://github.com/acme/brain.git',
    };
    expect(
      brainSyncHeadline({ ...base, dirty: true, changedFiles: ['tasks/plan-work.json'] }),
    ).toBe('acme/brain · 1 modified file');
    expect(brainSyncHeadline({ ...base, behindBy: 2 })).toBe('acme/brain · 2 commits behind');
    expect(brainSyncHeadline({ ...base })).toBe('acme/brain · up to date');
  });
});
