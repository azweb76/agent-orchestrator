import { describe, expect, it } from 'vitest';
import type {
  InboxPullRequest,
  PullRequestInbox,
  SidebarAgent,
  SidebarWorkspace,
} from '@agent-orchestrator/shared';
import {
  buildPaletteCommands,
  filterPaletteCommands,
  isCommandPaletteShortcut,
  paletteShortcutLabel,
  type PaletteKeyEvent,
} from './paletteCommands';

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

function makeInboxPr(overrides: Partial<InboxPullRequest> = {}): InboxPullRequest {
  return {
    number: 42,
    title: 'Add palette',
    state: 'open',
    htmlUrl: 'https://github.com/acme/orchestrator/pull/42',
    draft: false,
    owner: 'acme',
    repo: 'orchestrator',
    authorLogin: 'dan',
    updatedAt: '2026-01-02T00:00:00.000Z',
    category: 'authored',
    workspaceId: null,
    agentId: null,
    ...overrides,
  };
}

describe('buildPaletteCommands', () => {
  it('includes actions, agents, workspaces, and pull requests', () => {
    const inbox: PullRequestInbox = { authored: [makeInboxPr()], reviewRequested: [] };
    const commands = buildPaletteCommands([makeWorkspace()], inbox);

    expect(commands.some((c) => c.id === 'action:toggle-sidebar')).toBe(true);
    expect(commands.some((c) => c.id === 'action:new-workspace')).toBe(true);
    expect(commands.some((c) => c.id === 'action:new-agent:ws-1')).toBe(true);

    const agent = commands.find((c) => c.id === 'agent:agent-1');
    expect(agent?.group).toBe('Agents');
    expect(agent?.action).toEqual({ kind: 'navigate', to: '/agents/agent-1' });

    const workspace = commands.find((c) => c.id === 'workspace:ws-1');
    expect(workspace?.action).toEqual({ kind: 'navigate', to: '/workspaces/ws-1' });

    const pr = commands.find((c) => c.id === 'pr:acme/orchestrator#42');
    expect(pr?.label).toBe('#42 Add palette');
    expect(pr?.action).toEqual({ kind: 'navigate', to: '/pull-requests/acme/orchestrator/42' });
  });

  it('carries the workspace default branch into the new-agent action', () => {
    const commands = buildPaletteCommands([makeWorkspace({ defaultBranch: 'develop' })], null);
    const newAgent = commands.find((c) => c.id === 'action:new-agent:ws-1');
    expect(newAgent?.action).toEqual({
      kind: 'new-agent',
      workspaceId: 'ws-1',
      defaultBranch: 'develop',
    });
  });

  it('skips archived agents', () => {
    const workspace = makeWorkspace({
      agents: [makeAgent(), makeAgent({ id: 'agent-2', status: 'archived' })],
    });
    const commands = buildPaletteCommands([workspace], null);
    expect(commands.some((c) => c.id === 'agent:agent-1')).toBe(true);
    expect(commands.some((c) => c.id === 'agent:agent-2')).toBe(false);
  });

  it('omits the pull request group without inbox data and dedupes PRs', () => {
    expect(buildPaletteCommands([], null).some((c) => c.group === 'Pull requests')).toBe(false);

    const duplicated: PullRequestInbox = {
      authored: [makeInboxPr()],
      reviewRequested: [makeInboxPr({ category: 'review_requested' })],
    };
    const prs = buildPaletteCommands([], duplicated).filter((c) => c.group === 'Pull requests');
    expect(prs).toHaveLength(1);
  });

  it('includes fleet bulk commands when counts are provided', () => {
    const commands = buildPaletteCommands([], null, {
      fixCi: 2,
      addressReview: 0,
      archiveMerged: 1,
      needsInput: 3,
    });
    expect(commands.some((c) => c.id === 'fleet:fix-ci-all')).toBe(true);
    expect(commands.some((c) => c.id === 'fleet:archive-merged-all')).toBe(true);
    expect(commands.some((c) => c.id === 'fleet:address-review-all')).toBe(false);
  });
});

describe('filterPaletteCommands', () => {
  const commands = buildPaletteCommands(
    [makeWorkspace()],
    { authored: [makeInboxPr()], reviewRequested: [] },
  );

  it('returns everything for an empty query', () => {
    expect(filterPaletteCommands(commands, '')).toEqual(commands);
    expect(filterPaletteCommands(commands, '   ')).toEqual(commands);
  });

  it('matches case-insensitively on label, hint, and keywords', () => {
    expect(filterPaletteCommands(commands, 'LOGIN').map((c) => c.id)).toContain('agent:agent-1');
    // "fix/login" only appears in the agent hint/keywords.
    expect(filterPaletteCommands(commands, 'fix/login').map((c) => c.id)).toEqual(['agent:agent-1']);
    expect(filterPaletteCommands(commands, 'sidebar').map((c) => c.id)).toEqual([
      'action:toggle-sidebar',
    ]);
  });

  it('requires every token to match', () => {
    expect(filterPaletteCommands(commands, 'new agent orchestrator').map((c) => c.id)).toEqual([
      'action:new-agent:ws-1',
    ]);
    expect(filterPaletteCommands(commands, 'login zebra')).toEqual([]);
  });
});

describe('isCommandPaletteShortcut', () => {
  const event = (overrides: Partial<PaletteKeyEvent>): PaletteKeyEvent => ({
    key: 'k',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  });

  it('accepts Cmd+K and Ctrl+K (any letter casing)', () => {
    expect(isCommandPaletteShortcut(event({ metaKey: true }))).toBe(true);
    expect(isCommandPaletteShortcut(event({ ctrlKey: true }))).toBe(true);
    expect(isCommandPaletteShortcut(event({ metaKey: true, key: 'K' }))).toBe(true);
  });

  it('never fires on keystrokes the chat composer owns', () => {
    // Plain typing, Enter, and Cmd/Ctrl+Enter must stay with the composer.
    expect(isCommandPaletteShortcut(event({}))).toBe(false);
    expect(isCommandPaletteShortcut(event({ key: 'Enter' }))).toBe(false);
    expect(isCommandPaletteShortcut(event({ key: 'Enter', metaKey: true }))).toBe(false);
    expect(isCommandPaletteShortcut(event({ key: 'Enter', ctrlKey: true }))).toBe(false);
  });

  it('requires the exact modifier combo', () => {
    expect(isCommandPaletteShortcut(event({ metaKey: true, shiftKey: true }))).toBe(false);
    expect(isCommandPaletteShortcut(event({ ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe('paletteShortcutLabel', () => {
  it('shows the platform-appropriate shortcut', () => {
    expect(paletteShortcutLabel('MacIntel')).toBe('⌘K');
    expect(paletteShortcutLabel('iPhone')).toBe('⌘K');
    expect(paletteShortcutLabel('Win32')).toBe('Ctrl+K');
    expect(paletteShortcutLabel('Linux x86_64')).toBe('Ctrl+K');
    expect(paletteShortcutLabel('')).toBe('Ctrl+K');
  });
});
