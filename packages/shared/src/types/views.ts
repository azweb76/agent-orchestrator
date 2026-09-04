import type { AgentDeliveryPhase } from '../agent-delivery-phase.js';
import type { SpendBudgetStatus } from '../app-settings.js';
import type { ChatSession } from '../chat-session.js';
import type { InstructionDraftOffer } from '../instruction-files.js';
import type { Agent, Worktree, Workspace } from './entities.js';
import type { PrStatusSnapshot } from './github.js';

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

export interface TaskSuggestion {
  id: string;
  title: string;
  prompt: string;
}

export interface TaskSuggestionsOffer {
  sessionId: string;
  suggestions: TaskSuggestion[];
}

export interface AgentDetail extends Agent {
  worktree: Worktree;
  workspace: Workspace;
  sessions: ChatSession[];
  /** Set when a completed Build session has a diff and no open PR. */
  draftPrOffer?: DraftPrOffer | null;
  /** Set after any completed session, offering LLM-generated follow-up tasks. */
  taskSuggestions?: TaskSuggestionsOffer | null;
  /**
   * Set after a graded Build / Fix CI session with instruction/skill findings.
   * Applying a draft always stays manual.
   */
  instructionDraftOffer?: InstructionDraftOffer | null;
  prStatus: PrStatusSnapshot | null;
}

/** Agent summary for sidebar navigation (includes worktree context). */
export interface SidebarAgent extends Agent {
  worktree: Pick<Worktree, 'id' | 'name' | 'branch' | 'prNumber'>;
  /** Pending interactive prompts (AskUserQuestion / tool permissions) across sessions. */
  pendingPermissionCount: number;
  /** Watchdog flagged this agent as stalled (stale permission, idle stream, etc.). */
  stalled?: boolean;
  prStatus: PrStatusSnapshot | null;
  /**
   * Derived PR-delivery phase for fleet / flight-controller UI.
   * Computed server-side from sessions + cached PR snapshot.
   */
  deliveryPhase: AgentDeliveryPhase;
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

/** Palette / search hit for a chat session transcript snippet. */
export interface SessionSearchHit {
  sessionId: string;
  agentId: string;
  agentName: string;
  workspaceName: string;
  title: string;
  snippet: string;
  updatedAt: string;
}

/** Active agent whose linked pull request has merged on GitHub. */
export interface MergedFleetAgent {
  agentId: string;
  agentName: string;
  workspaceName: string;
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
}

/** Fleet-wide cost rollup for the dashboard (`GET /api/usage`). */
export interface UsageSummary {
  totalCostUsd: number;
  /** Cost of assistant turns recorded since local midnight. */
  todayCostUsd: number;
  totalAssistantTurns: number;
  /** Per-agent rollups sorted by total cost, highest first. */
  agents: AgentUsage[];
  /** Spend cap snapshot for dashboard hints. */
  budget: SpendBudgetStatus;
}

/** Whether a live Claude Code process is managed by this orchestrator. */
export type ClaudeProcessOwnership = 'orchestrator' | 'external';

/** One Claude Code CLI process discovered on the host (`GET /api/claude/processes`). */
export interface ClaudeProcessInfo {
  pid: number;
  ppid: number;
  /** Truncated process argv / command line. */
  command: string;
  cwd: string | null;
  ownership: ClaudeProcessOwnership;
  agentId: string | null;
  agentName: string | null;
  sessionId: string | null;
  workspaceName: string | null;
}
