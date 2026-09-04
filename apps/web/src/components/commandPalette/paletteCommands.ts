import type {
  PullRequestInbox,
  SessionSearchHit,
  SidebarWorkspace,
} from '@agent-orchestrator/shared';
import { pullRequestPath } from '../../utils/paths';
import type { FleetBulkActionId, FleetBulkCounts } from './fleetBulkActions';
import { fleetBulkActionLabel } from './fleetBulkActions';

export type PaletteGroup =
  | 'Actions'
  | 'Fleet'
  | 'Agents'
  | 'Workspaces'
  | 'Pull requests'
  | 'Transcripts';

export type PaletteCommandAction =
  | { kind: 'navigate'; to: string; state?: Record<string, unknown> }
  | { kind: 'new-agent'; workspaceId: string; defaultBranch?: string }
  | { kind: 'new-workspace' }
  | { kind: 'toggle-sidebar' }
  | { kind: 'bulk'; bulk: FleetBulkActionId }
  | { kind: 'open-session'; agentId: string; sessionId: string };

export interface PaletteCommand {
  id: string;
  group: PaletteGroup;
  label: string;
  hint?: string;
  /** Extra search terms beyond the visible label and hint. */
  keywords?: string;
  action: PaletteCommandAction;
}

/**
 * Flatten sidebar + PR inbox data into the ordered command list shown by the
 * Cmd/Ctrl+K palette. Archived agents are excluded — they are not jump
 * targets, mirroring the dashboard fleet list.
 */
export function buildPaletteCommands(
  tree: SidebarWorkspace[],
  inbox: PullRequestInbox | null,
  bulkCounts?: FleetBulkCounts,
): PaletteCommand[] {
  const commands: PaletteCommand[] = [
    {
      id: 'action:new-workspace',
      group: 'Actions',
      label: 'New workspace…',
      keywords: 'create add clone repo repository',
      action: { kind: 'new-workspace' },
    },
    {
      id: 'action:toggle-sidebar',
      group: 'Actions',
      label: 'Toggle sidebar',
      keywords: 'collapse expand navigation menu',
      action: { kind: 'toggle-sidebar' },
    },
    {
      id: 'action:go-settings',
      group: 'Actions',
      label: 'Go to settings',
      keywords: 'preferences notifications theme auth appearance',
      action: { kind: 'navigate', to: '/settings' },
    },
    {
      id: 'action:go-tasks',
      group: 'Actions',
      label: 'Go to tasks',
      keywords: 'agent tasks templates prompt system model effort permissions purpose from-goal',
      action: { kind: 'navigate', to: '/tasks' },
    },
    {
      id: 'action:go-dashboard',
      group: 'Actions',
      label: 'Go to dashboard',
      keywords: 'home command center',
      action: { kind: 'navigate', to: '/' },
    },
    {
      id: 'action:go-flight',
      group: 'Actions',
      label: 'Go to flight controller',
      keywords: 'airspace map flights boarding airborne approach landed',
      action: { kind: 'navigate', to: '/flight' },
    },
    {
      id: 'action:go-workspaces',
      group: 'Actions',
      label: 'Go to workspaces',
      keywords: 'repos repositories',
      action: { kind: 'navigate', to: '/workspaces' },
    },
    {
      id: 'action:go-pull-requests',
      group: 'Actions',
      label: 'Go to pull requests',
      keywords: 'prs inbox reviews',
      action: { kind: 'navigate', to: '/pull-requests' },
    },
  ];

  if (bulkCounts) {
    commands.push(...buildFleetBulkCommands(bulkCounts));
  }

  for (const workspace of tree) {
    commands.push({
      id: `action:new-agent:${workspace.id}`,
      group: 'Actions',
      label: `New agent in ${workspace.name}`,
      hint: `${workspace.githubOwner}/${workspace.githubRepo}`,
      keywords: 'create start worktree',
      action: {
        kind: 'new-agent',
        workspaceId: workspace.id,
        defaultBranch: workspace.defaultBranch,
      },
    });
  }

  for (const workspace of tree) {
    for (const agent of workspace.agents) {
      if (agent.status === 'archived') continue;
      commands.push({
        id: `agent:${agent.id}`,
        group: 'Agents',
        label: agent.name,
        hint: `${workspace.name} · ${agent.worktree.branch}`,
        keywords: `${agent.worktree.branch} ${agent.status} agent jump open`,
        action: { kind: 'navigate', to: `/agents/${agent.id}` },
      });
    }
  }

  for (const workspace of tree) {
    commands.push({
      id: `workspace:${workspace.id}`,
      group: 'Workspaces',
      label: workspace.name,
      hint: `${workspace.githubOwner}/${workspace.githubRepo}`,
      keywords: `${workspace.defaultBranch} workspace jump open`,
      action: { kind: 'navigate', to: `/workspaces/${workspace.id}` },
    });
  }

  if (inbox) {
    const seen = new Set<string>();
    for (const pr of [...inbox.authored, ...inbox.reviewRequested]) {
      const key = `${pr.owner}/${pr.repo}#${pr.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      commands.push({
        id: `pr:${key}`,
        group: 'Pull requests',
        label: `#${pr.number} ${pr.title}`,
        hint: `${pr.owner}/${pr.repo} · ${pr.category === 'authored' ? 'authored' : 'review'}`,
        keywords: `${pr.authorLogin} pull request pr`,
        action: { kind: 'navigate', to: pullRequestPath(pr.owner, pr.repo, pr.number) },
      });
    }
  }

  return commands;
}

export function buildFleetBulkCommands(counts: FleetBulkCounts): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  const push = (bulk: FleetBulkActionId, count: number, keywords: string) => {
    if (count <= 0) return;
    commands.push({
      id: `fleet:${bulk}`,
      group: 'Fleet',
      label: fleetBulkActionLabel(bulk, count),
      keywords,
      action: { kind: 'bulk', bulk },
    });
  };
  push('fix-ci-all', counts.fixCi, 'bulk fleet ci checks failing fix');
  push('address-review-all', counts.addressReview, 'bulk fleet review requested address');
  push('archive-merged-all', counts.archiveMerged, 'bulk fleet archive merged cleanup');
  push('open-needs-input-all', counts.needsInput, 'bulk fleet needs input permission blocked');
  return commands;
}

export function transcriptHitsToCommands(hits: SessionSearchHit[]): PaletteCommand[] {
  return hits.map((hit) => ({
    id: `transcript:${hit.sessionId}`,
    group: 'Transcripts' as const,
    label: hit.title,
    hint: `${hit.agentName} · ${hit.workspaceName}`,
    keywords: `${hit.snippet} transcript session chat idea prompt`,
    action: { kind: 'open-session', agentId: hit.agentId, sessionId: hit.sessionId },
  }));
}

/** Every whitespace-separated token must match the label, hint, or keywords. */
export function filterPaletteCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return commands;
  return commands.filter((command) => {
    const haystack = `${command.label} ${command.hint ?? ''} ${command.keywords ?? ''}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export interface PaletteKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Cmd/Ctrl+K is the only global shortcut. Requiring this exact modifier combo
 * keeps the chat composer in charge of typing: the combo never inserts a
 * character and never collides with the composer's Enter / Cmd+Enter handling.
 */
export function isCommandPaletteShortcut(event: PaletteKeyEvent): boolean {
  if (event.altKey || event.shiftKey) return false;
  if (!event.metaKey && !event.ctrlKey) return false;
  return event.key.toLowerCase() === 'k';
}

/** Human-readable shortcut for the current platform (⌘K on Apple devices). */
export function paletteShortcutLabel(
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
): string {
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘K' : 'Ctrl+K';
}
