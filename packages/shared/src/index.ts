export type AgentStatus = 'idle' | 'running' | 'stopped' | 'archived';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Workspace {
  id: string;
  name: string;
  repoUrl: string;
  repoPath: string;
  defaultBranch: string;
  githubOwner: string;
  githubRepo: string;
  createdAt: string;
}

export interface Worktree {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  branch: string;
  prNumber: number | null;
  prTitle: string | null;
  baseBranch: string | null;
  createdAt: string;
}

export interface Agent {
  id: string;
  worktreeId: string;
  name: string;
  status: AgentStatus;
  model: string;
  environment: string | null;
  claudeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Message {
  id: string;
  agentId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface AgentEvent {
  id: string;
  agentId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface GitHubBranch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  headRef: string;
  baseRef: string;
  htmlUrl: string;
  draft: boolean;
}

export interface InboxPullRequest {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  draft: boolean;
  owner: string;
  repo: string;
  authorLogin: string;
  updatedAt: string;
  /** Category for this PR relative to the authenticated user. */
  category: 'authored' | 'review_requested';
  /** Existing local workspace for this repo, if any. */
  workspaceId: string | null;
  /** Existing local agent created from this PR, if any. */
  agentId: string | null;
}

export interface PullRequestInbox {
  authored: InboxPullRequest[];
  reviewRequested: InboxPullRequest[];
}

export interface CreateAgentFromPrRequest {
  owner: string;
  repo: string;
  prNumber: number;
  name?: string;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  private: boolean;
}

export interface CreateWorkspaceRequest {
  repoUrl: string;
  name?: string;
}

export interface CreateWorktreeFromBranchRequest {
  branch: string;
  name?: string;
  /** When true, create a new branch instead of checking out an existing one. */
  createNew?: boolean;
  /** Base ref to branch from when createNew is true (defaults to workspace default branch). */
  baseBranch?: string;
}

export interface CreateWorktreeFromPrRequest {
  prNumber: number;
  name?: string;
}

export interface SuggestBranchNameRequest {
  idea: string;
}

export interface SuggestBranchNameResponse {
  branchName: string;
}

export interface UpdateAgentRequest {
  name?: string;
  model?: string;
  environment?: string | null;
}

export interface ChatRequest {
  message: string;
}

export interface CreatePrRequest {
  title: string;
  body?: string;
  base?: string;
}

export interface AgentDiff {
  stat: string;
  patch: string;
}

export interface WorkspaceWithCounts extends Workspace {
  worktreeCount: number;
  agentCount: number;
}

export interface WorktreeWithAgent extends Worktree {
  agent: Agent | null;
}

export interface AgentDetail extends Agent {
  worktree: Worktree;
  workspace: Workspace;
}

/** Agent summary for sidebar navigation (includes worktree context). */
export interface SidebarAgent extends Agent {
  worktree: Pick<Worktree, 'id' | 'name' | 'branch' | 'prNumber'>;
}

/** Workspace with nested agents for the app sidebar tree. */
export interface SidebarWorkspace extends Workspace {
  agents: SidebarAgent[];
}

export const CLAUDE_MODELS = [
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'opus', label: 'Claude Opus' },
  { id: 'haiku', label: 'Claude Haiku' },
] as const;
