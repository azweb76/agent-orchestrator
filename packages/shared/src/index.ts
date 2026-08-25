export type AgentStatus = 'idle' | 'running' | 'stopped' | 'archived';

export type MessageRole = 'user' | 'assistant' | 'system';

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions';

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
  permissionMode: PermissionMode;
  claudeSessionId: string | null;
  /** OS pid of the active Claude run, if any. Survives app restarts while the process lives. */
  pid: number | null;
  /** Stream-json log path for the active Claude run (used to resume after app restart). */
  runLogPath: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface MessageAttachment {
  id: string;
  type: 'image';
  mimeType: string;
  name: string;
  /** Absolute path on the server filesystem. */
  path: string;
  /** Public API URL for the web client. */
  url: string;
}

export interface MessageMetadata {
  costUsd?: number;
  stopped?: boolean;
  error?: string;
  durationMs?: number;
}

export interface Message {
  id: string;
  agentId: string;
  role: MessageRole;
  content: string;
  attachments: MessageAttachment[];
  metadata: MessageMetadata;
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
  permissionMode?: PermissionMode;
}

export interface ChatImageAttachment {
  name: string;
  mimeType: string;
  /** Raw base64 without data-URL prefix. */
  dataBase64: string;
}

export interface ChatRequest {
  message: string;
  /** When true, stop any in-flight Claude run before starting this message. */
  force?: boolean;
  images?: ChatImageAttachment[];
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

export const PERMISSION_MODES = [
  { id: 'default', label: 'Manual' },
  { id: 'acceptEdits', label: 'Accept edits' },
  { id: 'plan', label: 'Plan' },
  { id: 'auto', label: 'Auto' },
  { id: 'dontAsk', label: "Don't ask" },
  { id: 'bypassPermissions', label: 'Bypass permissions' },
] as const satisfies ReadonlyArray<{ id: PermissionMode; label: string }>;

export const CHAT_SLASH_COMMANDS = [
  { command: '/diff', prompt: 'Show a summary of the current git diff and what still needs work.' },
  { command: '/test', prompt: 'Run the relevant tests for recent changes and fix any failures.' },
  { command: '/pr', prompt: 'Prepare a pull request: summarize changes, suggest a title and description.' },
  { command: '/review', prompt: 'Review the current changes for bugs, edge cases, and missing tests.' },
] as const;

/** How a slash command should be handled by the orchestrator chat UI. */
export type SlashCommandKind = 'local' | 'prompt' | 'skill';

export interface SlashCommand {
  /** Fully-qualified command including leading slash, e.g. `/clear` or `/code-review`. */
  command: string;
  /** Short human-readable description shown in autocomplete. */
  description: string;
  kind: SlashCommandKind;
  /**
   * For `prompt` commands: text sent to Claude instead of the raw command.
   * For `skill` commands: omitted (the command itself is sent through).
   * For `local` commands: omitted (handled in the client).
   */
  prompt?: string;
  /** Optional aliases that also match this command (e.g. `/reset` → `/clear`). */
  aliases?: string[];
  /** Where the command was discovered from. */
  source?: 'app' | 'project' | 'personal' | 'bundled';
}

/** Built-in orchestrator-local slash commands (not forwarded to Claude). */
export const LOCAL_SLASH_COMMANDS: SlashCommand[] = [
  {
    command: '/clear',
    description: 'Clear chat history and reset the Claude session',
    kind: 'local',
    aliases: ['/reset', '/new'],
    source: 'app',
  },
];

/**
 * Bundled Claude Code skills that work when sent as a prompt in print mode.
 * Discovered project/personal skills are merged on top at runtime.
 */
export const BUNDLED_SKILL_COMMANDS: SlashCommand[] = [
  { command: '/batch', description: 'Orchestrate large parallel codebase changes', kind: 'skill', source: 'bundled' },
  { command: '/code-review', description: 'Review the current diff for bugs and cleanups', kind: 'skill', source: 'bundled', aliases: ['/review'] },
  { command: '/debug', description: 'Enable debug logging and troubleshoot issues', kind: 'skill', source: 'bundled' },
  { command: '/doctor', description: 'Run a Claude Code setup checkup', kind: 'skill', source: 'bundled', aliases: ['/checkup'] },
  { command: '/simplify', description: 'Clean up changed code and apply fixes', kind: 'skill', source: 'bundled' },
  { command: '/verify', description: 'Build and run the app to confirm a change works', kind: 'skill', source: 'bundled' },
  { command: '/run', description: 'Launch and drive the project app', kind: 'skill', source: 'bundled' },
  { command: '/security-review', description: 'Check the branch diff for security issues', kind: 'skill', source: 'bundled' },
  { command: '/init', description: 'Initialize project with a CLAUDE.md guide', kind: 'skill', source: 'bundled' },
];

export const PROMPT_SLASH_COMMANDS: SlashCommand[] = CHAT_SLASH_COMMANDS.map((item) => ({
  command: item.command,
  description: item.prompt,
  kind: 'prompt' as const,
  prompt: item.prompt,
  source: 'app' as const,
}));

export {
  appendStreamText,
  applyStreamEvent,
  extractToolActivity,
  type StreamPart,
  type ToolActivityItem,
} from './stream-timeline.js';

