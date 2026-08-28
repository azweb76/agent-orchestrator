import type { ChatSession } from '../chat-session.js';
import type { Agent, Worktree, Workspace } from './entities.js';

/** Diff view scope for an agent's worktree. */
export type AgentDiffScope = 'pending' | 'pr';

export interface AgentDiff {
  stat: string;
  patch: string;
  /** Absolute worktree path on the server. */
  path: string;
  scope: AgentDiffScope;
}

export interface WorkspaceWithCounts extends Workspace {
  worktreeCount: number;
  agentCount: number;
}

export interface WorktreeWithAgent extends Worktree {
  agent: Agent | null;
}

export interface DraftPrOffer {
  sessionId: string;
}

export interface AgentDetail extends Agent {
  worktree: Worktree;
  workspace: Workspace;
  sessions: ChatSession[];
  /** Set when a completed Build session has a diff and no open PR (autopilot off). */
  draftPrOffer?: DraftPrOffer | null;
}

/** Agent summary for sidebar navigation (includes worktree context). */
export interface SidebarAgent extends Agent {
  worktree: Pick<Worktree, 'id' | 'name' | 'branch' | 'prNumber'>;
  /** Pending interactive prompts (AskUserQuestion / tool permissions) across sessions. */
  pendingPermissionCount: number;
}

/** Workspace with nested agents for the app sidebar tree. */
export interface SidebarWorkspace extends Workspace {
  agents: SidebarAgent[];
}

/** Spend/turn rollup computed from persisted assistant turns. */
export interface UsageRollup {
  costUsd: number;
  assistantTurns: number;
  /** ISO timestamp of the most recent assistant turn included, if any. */
  lastActivityAt: string | null;
}

export interface SessionUsage extends UsageRollup {
  sessionId: string;
  title: string;
}

export interface AgentUsage extends UsageRollup {
  agentId: string;
  agentName: string;
  workspaceId: string;
  workspaceName: string;
  archived: boolean;
  sessions: SessionUsage[];
}

/** Fleet-wide cost rollup for the dashboard (`GET /api/usage`). */
export interface UsageSummary {
  totalCostUsd: number;
  /** Cost of assistant turns recorded since local midnight. */
  todayCostUsd: number;
  totalAssistantTurns: number;
  /** Per-agent rollups sorted by total cost, highest first. */
  agents: AgentUsage[];
}
