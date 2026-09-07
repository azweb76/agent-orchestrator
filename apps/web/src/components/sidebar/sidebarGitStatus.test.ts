import { describe, expect, it } from 'vitest';
import type { SidebarAgent } from '@agent-orchestrator/shared';
import {
  formatAheadBehind,
  formatSidebarBranchCaption,
  formatSidebarGitCaption,
} from './sidebarGitStatus';
import {
  formatSidebarStatusCaption,
  resolveSidebarPrKind,
  sidebarAgentStatusLines,
  sidebarPhaseWorthShowing,
} from './sidebarPrStatus';

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

describe('formatSidebarBranchCaption / formatSidebarGitCaption', () => {
  it('shows branch alone when clean', () => {
    expect(formatSidebarBranchCaption(makeAgent())).toBe('fix/login');
    expect(formatSidebarGitCaption(makeAgent())).toBe('fix/login');
  });

  it('keeps dirty out of the branch row but in the full caption', () => {
    const agent = makeAgent({ gitStatus: { dirty: true, aheadBy: 2, behindBy: 1 } });
    expect(formatSidebarBranchCaption(agent)).toBe('fix/login · ↑2 ↓1');
    expect(formatSidebarGitCaption(agent)).toBe('fix/login · ↑2 ↓1 · dirty');
  });
});

describe('resolveSidebarPrKind', () => {
  it('uses prStatus when present', () => {
    expect(
      resolveSidebarPrKind(
        makeAgent({
          worktree: { id: 'wt-1', name: 'x', branch: 'feat', prNumber: 9 },
          prStatus: {
            state: 'open',
            draft: true,
            merged: false,
            checksRollup: 'none',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          deliveryPhase: 'pr_draft',
        }),
      ),
    ).toBe('draft');
  });

  it('falls back to deliveryPhase when cache is cold but PR is linked', () => {
    expect(
      resolveSidebarPrKind(
        makeAgent({
          worktree: { id: 'wt-1', name: 'x', branch: 'feat', prNumber: 9 },
          prStatus: null,
          deliveryPhase: 'pr_draft',
        }),
      ),
    ).toBe('draft');
  });

  it('shows open glyph for needs_pr offers without a linked number', () => {
    expect(resolveSidebarPrKind(makeAgent({ deliveryPhase: 'needs_pr' }))).toBe('open');
  });

  it('returns null for plain planning agents', () => {
    expect(resolveSidebarPrKind(makeAgent())).toBe(null);
  });
});

describe('formatSidebarStatusCaption', () => {
  it('appends delivery phase for draft PRs', () => {
    expect(
      formatSidebarStatusCaption(
        makeAgent({
          deliveryPhase: 'pr_draft',
          worktree: { id: 'wt-1', name: 'x', branch: 'feat/draft', prNumber: 3 },
        }),
      ),
    ).toBe('feat/draft · Draft PR');
  });

  it('omits planning from the secondary caption', () => {
    expect(formatSidebarStatusCaption(makeAgent())).toBe('fix/login');
    expect(sidebarPhaseWorthShowing('planning')).toBe(false);
    expect(sidebarPhaseWorthShowing('pr_draft')).toBe(true);
  });
});

describe('sidebarAgentStatusLines', () => {
  it('labels draft PRs explicitly', () => {
    const lines = sidebarAgentStatusLines(
      makeAgent({
        status: 'idle',
        deliveryPhase: 'pr_draft',
        worktree: { id: 'wt-1', name: 'x', branch: 'feat/draft', prNumber: 12 },
        prStatus: {
          state: 'open',
          draft: true,
          merged: false,
          checksRollup: 'none',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
    expect(lines).toContain('Draft PR');
    expect(lines).toContain('Draft PR #12');
    expect(lines).toContain('idle');
  });
});
