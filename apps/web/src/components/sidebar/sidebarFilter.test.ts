import { describe, expect, it } from 'vitest';
import type { SidebarAgent, SidebarWorkspace } from '@agent-orchestrator/shared';
import {
  agentMatchesStatusFilter,
  filterSidebarTree,
  isSidebarFilterActive,
  type SidebarStatusFilter,
} from './sidebarFilter';

function makeAgent(overrides: Partial<SidebarAgent> = {}): SidebarAgent {
  return {
    id: 'agent-1',
    worktreeId: 'wt-1',
    name: 'Fix login bug',
    status: 'idle',
    claudeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    worktree: { id: 'wt-1', name: 'fix-login', branch: 'fix/login', prNumber: null },
    pendingPermissionCount: 0,
    ...overrides,
  } as SidebarAgent;
}

function makeWorkspace(overrides: Partial<SidebarWorkspace> = {}): SidebarWorkspace {
  return {
    id: 'ws-1',
    name: 'orchestrator',
    repoUrl: 'https://github.com/acme/orchestrator.git',
    repoPath: '/data/repos/orchestrator',
    defaultBranch: 'main',
    githubOwner: 'acme',
    githubRepo: 'orchestrator',
    createdAt: '2026-01-01T00:00:00.000Z',
    agents: [makeAgent()],
    ...overrides,
  };
}

const noStatuses: ReadonlySet<SidebarStatusFilter> = new Set();

describe('agentMatchesStatusFilter', () => {
  it('matches running for running and queued agents', () => {
    expect(agentMatchesStatusFilter(makeAgent({ status: 'running' }), 'running')).toBe(true);
    expect(agentMatchesStatusFilter(makeAgent({ status: 'queued' }), 'running')).toBe(true);
    expect(agentMatchesStatusFilter(makeAgent({ status: 'idle' }), 'running')).toBe(false);
  });

  it('matches needs-input on pending permissions regardless of status', () => {
    expect(
      agentMatchesStatusFilter(makeAgent({ status: 'running', pendingPermissionCount: 2 }), 'needs-input'),
    ).toBe(true);
    expect(agentMatchesStatusFilter(makeAgent({ pendingPermissionCount: 0 }), 'needs-input')).toBe(false);
  });

  it('matches idle only for resting agents without pending input', () => {
    expect(agentMatchesStatusFilter(makeAgent({ status: 'idle' }), 'idle')).toBe(true);
    expect(agentMatchesStatusFilter(makeAgent({ status: 'stopped' }), 'idle')).toBe(true);
    expect(agentMatchesStatusFilter(makeAgent({ status: 'running' }), 'idle')).toBe(false);
    expect(agentMatchesStatusFilter(makeAgent({ pendingPermissionCount: 1 }), 'idle')).toBe(false);
  });
});

describe('isSidebarFilterActive', () => {
  it('is inactive for blank query and no statuses', () => {
    expect(isSidebarFilterActive('', noStatuses)).toBe(false);
    expect(isSidebarFilterActive('   ', noStatuses)).toBe(false);
  });

  it('is active with a query or a status', () => {
    expect(isSidebarFilterActive('login', noStatuses)).toBe(true);
    expect(isSidebarFilterActive('', new Set<SidebarStatusFilter>(['running']))).toBe(true);
  });
});

describe('filterSidebarTree', () => {
  it('returns the tree unchanged when nothing is filtered', () => {
    const tree = [makeWorkspace()];
    expect(filterSidebarTree(tree, '', noStatuses)).toBe(tree);
  });

  it('matches agents by name case-insensitively', () => {
    const tree = [
      makeWorkspace({
        agents: [
          makeAgent({ id: 'a1', name: 'Fix login bug' }),
          makeAgent({
            id: 'a2',
            name: 'Add dark mode',
            worktree: { id: 'wt-2', name: 'dark-mode', branch: 'feat/dark-mode', prNumber: null },
          }),
        ],
      }),
    ];
    const filtered = filterSidebarTree(tree, 'LOGIN', noStatuses);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].agents.map((a) => a.id)).toEqual(['a1']);
  });

  it('matches agents by branch', () => {
    const tree = [
      makeWorkspace({
        agents: [
          makeAgent({
            id: 'a1',
            name: 'Palette',
            worktree: { id: 'wt-1', name: 'palette', branch: 'feat/palette', prNumber: null },
          }),
          makeAgent({ id: 'a2', name: 'Other' }),
        ],
      }),
    ];
    const filtered = filterSidebarTree(tree, 'feat/palette', noStatuses);
    expect(filtered[0].agents.map((a) => a.id)).toEqual(['a1']);
  });

  it('keeps all agents when the workspace name matches', () => {
    const tree = [
      makeWorkspace({
        name: 'orchestrator',
        agents: [makeAgent({ id: 'a1' }), makeAgent({ id: 'a2', name: 'Other' })],
      }),
      makeWorkspace({ id: 'ws-2', name: 'website', githubRepo: 'website' }),
    ];
    const filtered = filterSidebarTree(tree, 'orchestr', noStatuses);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('ws-1');
    expect(filtered[0].agents).toHaveLength(2);
  });

  it('keeps a query-matched workspace with no agents', () => {
    const tree = [makeWorkspace({ agents: [] })];
    expect(filterSidebarTree(tree, 'orchestrator', noStatuses)).toHaveLength(1);
  });

  it('drops workspaces with no matching agents', () => {
    const tree = [
      makeWorkspace({ agents: [makeAgent({ name: 'Alpha' })] }),
      makeWorkspace({
        id: 'ws-2',
        name: 'website',
        githubRepo: 'website',
        agents: [makeAgent({ id: 'a2', name: 'Beta task' })],
      }),
    ];
    const filtered = filterSidebarTree(tree, 'beta', noStatuses);
    expect(filtered.map((ws) => ws.id)).toEqual(['ws-2']);
  });

  it('requires every token to match', () => {
    const tree = [
      makeWorkspace({
        agents: [
          makeAgent({ id: 'a1', name: 'Fix login bug' }),
          makeAgent({
            id: 'a2',
            name: 'Fix dark mode',
            worktree: { id: 'wt-2', name: 'dark-mode', branch: 'feat/dark-mode', prNumber: null },
          }),
        ],
      }),
    ];
    const filtered = filterSidebarTree(tree, 'fix login', noStatuses);
    expect(filtered[0].agents.map((a) => a.id)).toEqual(['a1']);
  });

  it('filters agents by status as a union of selected filters', () => {
    const tree = [
      makeWorkspace({
        agents: [
          makeAgent({ id: 'a1', status: 'running' }),
          makeAgent({ id: 'a2', status: 'idle' }),
          makeAgent({ id: 'a3', status: 'stopped', pendingPermissionCount: 1 }),
        ],
      }),
    ];
    const running = filterSidebarTree(tree, '', new Set<SidebarStatusFilter>(['running']));
    expect(running[0].agents.map((a) => a.id)).toEqual(['a1']);

    const both = filterSidebarTree(
      tree,
      '',
      new Set<SidebarStatusFilter>(['running', 'needs-input']),
    );
    expect(both[0].agents.map((a) => a.id)).toEqual(['a1', 'a3']);
  });

  it('drops workspaces with no agents matching a status filter', () => {
    const tree = [makeWorkspace({ agents: [makeAgent({ status: 'idle' })] })];
    expect(filterSidebarTree(tree, '', new Set<SidebarStatusFilter>(['running']))).toHaveLength(0);
  });

  it('combines query and status filters', () => {
    const tree = [
      makeWorkspace({
        agents: [
          makeAgent({ id: 'a1', name: 'Fix login bug', status: 'running' }),
          makeAgent({ id: 'a2', name: 'Fix login flow', status: 'idle' }),
        ],
      }),
    ];
    const filtered = filterSidebarTree(tree, 'login', new Set<SidebarStatusFilter>(['running']));
    expect(filtered[0].agents.map((a) => a.id)).toEqual(['a1']);
  });

  it('narrows a query-matched workspace by status and drops it when empty', () => {
    const tree = [makeWorkspace({ agents: [makeAgent({ status: 'idle' })] })];
    const filtered = filterSidebarTree(
      tree,
      'orchestrator',
      new Set<SidebarStatusFilter>(['running']),
    );
    expect(filtered).toHaveLength(0);
  });
});
