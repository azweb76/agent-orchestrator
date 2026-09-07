import { describe, expect, it } from 'vitest';
import type { SidebarAgent } from '@agent-orchestrator/shared';
import {
  formatAheadBehind,
  formatSidebarGitCaption,
  sidebarAgentStatusLines,
} from './sidebarGitStatus';

function makeAgent(overrides: Partial<SidebarAgent> = {}): SidebarAgent {
  return {
    id: 'agent-1',
    worktreeId: 'wt-1',
    name: 'Fix login',
    status: 'idle',
    claudeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    worktree: { id: 'wt-1', name: 'fix-login', branch: 'fix/login', prNumber: null },
    pendingPermissionCount: 0,
    prStatus: null,
    deliveryPhase: 'planning',
    gitStatus: { dirty: false, aheadBy: 0, behindBy: 0 },
    ...overrides,
  } as SidebarAgent;
}

describe('formatAheadBehind', () => {
  it('formats ahead and behind counts', () => {
    expect(formatAheadBehind({ aheadBy: 0, behindBy: 0 })).toBe('');
    expect(formatAheadBehind({ aheadBy: 2, behindBy: 0 })).toBe('↑2');
    expect(formatAheadBehind({ aheadBy: 0, behindBy: 1 })).toBe('↓1');
    expect(formatAheadBehind({ aheadBy: 3, behindBy: 1 })).toBe('↑3 ↓1');
  });
});

describe('formatSidebarGitCaption', () => {
  it('shows branch alone when clean', () => {
    expect(formatSidebarGitCaption(makeAgent())).toBe('fix/login');
  });

  it('includes dirty and ahead/behind', () => {
    expect(
      formatSidebarGitCaption(
        makeAgent({ gitStatus: { dirty: true, aheadBy: 2, behindBy: 1 } }),
      ),
    ).toBe('fix/login · dirty · ↑2 ↓1');
  });
});

describe('sidebarAgentStatusLines', () => {
  it('includes git caption, runtime, and delivery phase', () => {
    const lines = sidebarAgentStatusLines(
      makeAgent({
        status: 'running',
        deliveryPhase: 'building',
        gitStatus: { dirty: true, aheadBy: 1, behindBy: 0 },
        worktree: { id: 'wt-1', name: 'fix-login', branch: 'fix/login', prNumber: 12 },
      }),
    );
    expect(lines[0]).toBe('fix/login · dirty · ↑1');
    expect(lines).toContain('running');
    expect(lines).toContain('Building');
    expect(lines).toContain('PR #12');
  });
});
