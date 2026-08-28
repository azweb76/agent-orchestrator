import type { StreamPart } from './stream-timeline.js';
import type { ChatSession } from './chat-session.js';
import type { ChatMention } from './chat-mentions.js';

export type AgentStatus = 'idle' | 'running' | 'queued' | 'stopped' | 'archived';

export type MessageRole = 'user' | 'assistant' | 'system';

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions';

/** Claude Code `--effort` levels (available levels depend on the model). */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

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
  /** Claude Code effort level passed as `--effort`. */
  effort: EffortLevel;
  permissionMode: PermissionMode;
  claudeSessionId: string | null;
  /** OS pid of the active Claude run, if any. Survives app restarts while the process lives. */
  pid: number | null;
  /** Stream-json log path for the active Claude run (used to resume after app restart). */
  runLogPath: string | null;
  /** Currently selected chat session. Runtime (pid / Claude session) lives on that session. */
  activeSessionId: string | null;
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
  /** True while Claude is still generating this assistant turn. */
  streaming?: boolean;
  /** Persisted interleaved text/tool timeline for display after remount. */
  timeline?: StreamPart[];
}

export interface Message {
  id: string;
  agentId: string;
  sessionId: string;
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

/** Live app-state change pushed over the global SSE stream (`/api/events/stream`). */
export type AppEventType =
  | 'agent_changed'
  | 'run_finished'
  | 'permission_request'
  | 'queue_changed'
  | 'workspaces_changed'
  | 'instruction_draft_offer';

export interface AppEvent {
  id: string;
  type: AppEventType;
  agentId: string | null;
  sessionId: string | null;
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
  authorLogin: string;
  updatedAt: string;
}

/** Workspace-scoped PR picker payload, including the authenticated GitHub login. */
export interface WorkspacePullRequestList {
  viewerLogin: string | null;
  pullRequests: GitHubPullRequest[];
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

/** How GitHub should combine the head branch into the base branch. */
export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase';

/**
 * GitHub's `mergeable_state`. Only present on the single-PR endpoint, and
 * `unknown` until GitHub finishes its background mergeability computation.
 */
export type PullRequestMergeableState =
  | 'clean'
  | 'dirty'
  | 'blocked'
  | 'behind'
  | 'unstable'
  | 'has_hooks'
  | 'draft'
  | 'unknown';

export interface PullRequestUser {
  login: string;
  avatarUrl: string | null;
  htmlUrl: string | null;
}

export interface PullRequestLabel {
  name: string;
  color: string | null;
}

export interface PullRequestDetail {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  /** Only ever `open` or `closed`; a merged PR is `closed` with `merged: true`. */
  state: string;
  draft: boolean;
  merged: boolean;
  /** `null` while GitHub is still computing mergeability. */
  mergeable: boolean | null;
  mergeableState: PullRequestMergeableState;
  rebaseable: boolean | null;
  headRef: string;
  baseRef: string;
  headSha: string;
  baseSha: string;
  htmlUrl: string;
  author: PullRequestUser | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  commentCount: number;
  reviewCommentCount: number;
  labels: PullRequestLabel[];
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  mergeCommitSha: string | null;
  /** Merge methods enabled in the repository settings. */
  allowedMergeMethods: PullRequestMergeMethod[];
  deleteBranchOnMerge: boolean;
  /** Existing local workspace for this repo, if any. */
  workspaceId: string | null;
  /** Existing local agent created from this PR, if any. */
  agentId: string | null;
}

export interface PullRequestCheck {
  id: string;
  name: string;
  /** Check runs and legacy commit statuses are normalized into one shape. */
  source: 'check_run' | 'status';
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  summary: string | null;
  detailsUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export type PullRequestChecksRollup = 'none' | 'pending' | 'success' | 'failure' | 'neutral';

export interface PullRequestChecks {
  /** Commit the checks belong to (always the PR head, never the test merge commit). */
  headSha: string;
  rollup: PullRequestChecksRollup;
  total: number;
  passing: number;
  failing: number;
  pending: number;
  neutral: number;
  /** True when the repo has more check runs than we fetched. */
  truncated: boolean;
  checks: PullRequestCheck[];
}

export interface PullRequestReview {
  id: string;
  author: PullRequestUser | null;
  state: string;
  body: string;
  htmlUrl: string | null;
  submittedAt: string | null;
}

export interface PullRequestFile {
  filename: string;
  previousFilename: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  /** Absent for binary and oversized files. */
  patch: string | null;
  blobUrl: string | null;
}

export interface PullRequestFiles {
  /** GitHub caps this endpoint at 300 files. */
  truncated: boolean;
  files: PullRequestFile[];
}

export interface PullRequestCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorLogin: string | null;
  authoredAt: string | null;
  htmlUrl: string | null;
}

export interface PullRequestComment {
  id: string;
  author: PullRequestUser | null;
  body: string;
  htmlUrl: string | null;
  createdAt: string;
}

/** Inline review comment on a pull request diff (may be part of a thread). */
export interface PullRequestReviewComment {
  id: string;
  author: PullRequestUser | null;
  body: string;
  path: string | null;
  line: number | null;
  htmlUrl: string | null;
  createdAt: string;
  inReplyToId: string | null;
  pullRequestReviewId: string | null;
}

export type PullRequestReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface SubmitPullRequestReviewRequest {
  event: PullRequestReviewEvent;
  body?: string;
}

export interface CreatePullRequestCommentRequest {
  body: string;
}

export interface MergePullRequestRequest {
  method: PullRequestMergeMethod;
  commitTitle?: string;
  commitMessage?: string;
  /** Head sha the user saw; GitHub 409s if the branch moved since. */
  expectedHeadSha?: string;
}

export interface MergePullRequestResponse {
  merged: boolean;
  message: string;
  sha: string | null;
}

export interface UpdatePullRequestBranchRequest {
  expectedHeadSha?: string;
}

export interface UpdatePullRequestBranchResponse {
  /** GitHub queues the update asynchronously, so this only means "accepted". */
  queued: boolean;
  message: string;
}

export interface SetPullRequestStateRequest {
  state: 'open' | 'closed';
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

/** Create a new branch + agent from a free-form idea (branch name is suggested server-side). */
export interface CreateWorktreeFromIdeaRequest {
  idea: string;
  name?: string;
  /** Base ref to branch from (defaults to workspace default branch). */
  baseBranch?: string;
  /** Claude model alias (e.g. sonnet, opus, haiku). */
  model?: string;
  /** Claude Code effort level for runs. */
  effort?: EffortLevel;
  /** Permission mode for the new agent session (defaults to plan). */
  permissionMode?: PermissionMode;
}

export interface ArchiveAgentRequest {
  /** When true, also remove the agent's git worktree from disk and the database. */
  deleteWorktree?: boolean;
}

export interface ArchiveAgentResponse {
  /** Null when the agent was removed along with its worktree. */
  agent: Agent | null;
  deletedWorktree: boolean;
}

export interface DeleteAgentRequest {
  /** When true, also remove the agent's git worktree from disk. */
  deleteWorktree?: boolean;
}

export interface DeleteAgentResponse {
  deleted: boolean;
  deletedWorktree: boolean;
}

export interface CommitAgentChangesRequest {
  message: string;
  /** When false, stage and commit without pushing. Defaults to true. */
  push?: boolean;
}

export interface CommitAgentChangesResponse {
  committed: boolean;
  pushed: boolean;
  branch: string;
  message: string;
}

export interface PruneArchivedAgentsResponse {
  /** Number of archived agent rows removed. */
  prunedAgents: number;
  /** Number of worktrees removed because they had no active agent left. */
  deletedWorktrees: number;
}

export interface ChatImageAttachment {
  name: string;
  mimeType: string;
  /** Raw base64 without data-URL prefix. */
  dataBase64: string;
}

export type { ChatMention, ChatMentionKind, WorktreeFileEntry } from './chat-mentions.js';
export { chatMentionLabel, formatChatMentionToken } from './chat-mentions.js';

export interface ChatRequest {
  message: string;
  /** When true, stop any in-flight Claude run before starting this message. */
  force?: boolean;
  images?: ChatImageAttachment[];
  mentions?: ChatMention[];
}

/**
 * Follow-up persisted server-side while a session is busy. The server sends
 * queued messages in order as soon as the running reply finishes, even if no
 * browser is attached.
 */
export interface QueuedChatMessage {
  id: string;
  agentId: string;
  sessionId: string;
  content: string;
  attachments: MessageAttachment[];
  mentions?: ChatMention[];
  createdAt: string;
}

export interface EnqueueChatMessageRequest {
  message: string;
  images?: ChatImageAttachment[];
  mentions?: ChatMention[];
}

/** Truncate chat from a user message onward and reset the Claude session. */
export interface RewindChatRequest {
  messageId: string;
}

export interface RewindChatResponse {
  removed: number;
  /** Original content of the rewound user message (for the composer draft). */
  draft: string;
  messageId: string;
}

/** Option for a clarifying question from the AskUserQuestion tool. */
export interface AskUserQuestionOption {
  label: string;
  description: string;
  preview?: string;
}

/** One question from AskUserQuestion (supports multiple questions per call). */
export interface AskUserQuestionItem {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionInput {
  questions: AskUserQuestionItem[];
  answers?: Record<string, string>;
  annotations?: Record<string, { preview?: string; notes?: string }>;
  metadata?: { source?: string };
}

/** ExitPlanMode input (plan text is injected by Claude Code for SDK consumers). */
export interface ExitPlanModeInput {
  plan?: string;
  planFilePath?: string;
  allowedPrompts?: Array<{ tool: string; prompt: string }>;
  [key: string]: unknown;
}

export type PermissionToolName = 'AskUserQuestion' | 'ExitPlanMode' | (string & {});

/** Pending interactive tool request waiting for a user decision. */
export interface PermissionRequest {
  requestId: string;
  toolName: PermissionToolName;
  input: Record<string, unknown>;
  toolUseId?: string;
  createdAt: string;
}

export interface AnswerAskUserQuestionRequest {
  requestId: string;
  /** Map of question text → selected label(s). Multi-select values may be comma-joined. */
  answers: Record<string, string>;
  /** Optional freeform reply instead of structured answers. */
  response?: string;
}

export interface DenyPermissionRequest {
  requestId: string;
  message?: string;
}

export interface AllowPermissionRequest {
  requestId: string;
  /** Optional override of tool input when allowing (defaults to pending input). */
  updatedInput?: Record<string, unknown>;
}

export interface BuildPlanRequest {
  /** Pending ExitPlanMode request id, when still waiting on the current run. */
  requestId?: string;
  /** Plan markdown to implement (falls back to the pending request input). */
  plan?: string;
}

export interface CreatePrRequest {
  title: string;
  body?: string;
  base?: string;
}

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

export interface AgentDetail extends Agent {
  worktree: Worktree;
  workspace: Workspace;
  sessions: ChatSession[];
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

export const CLAUDE_MODELS = [
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'opus', label: 'Claude Opus' },
  { id: 'haiku', label: 'Claude Haiku' },
] as const;

export const CLAUDE_EFFORT_LEVELS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
] as const satisfies ReadonlyArray<{ id: EffortLevel; label: string }>;

export const DEFAULT_EFFORT_LEVEL: EffortLevel = 'high';

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'plan';

export const PERMISSION_MODES = [
  { id: 'default', label: 'Manual' },
  { id: 'acceptEdits', label: 'Accept edits' },
  { id: 'plan', label: 'Plan' },
  { id: 'auto', label: 'Auto' },
  { id: 'dontAsk', label: "Don't ask" },
  { id: 'bypassPermissions', label: 'Bypass permissions' },
] as const satisfies ReadonlyArray<{ id: PermissionMode; label: string }>;

const CHAT_SLASH_COMMANDS = [
  { command: '/diff', prompt: 'Show a summary of the current git diff and what still needs work.' },
  { command: '/test', prompt: 'Run the relevant tests for recent changes and fix any failures.' },
  { command: '/pr', prompt: 'Prepare a pull request: summarize changes, suggest a title and description.' },
  { command: '/review', prompt: 'Review the current changes for bugs, edge cases, and missing tests.' },
] as const;

/** How a slash command should be handled by the orchestrator chat UI. */
export type SlashCommandKind = 'local' | 'prompt' | 'skill' | 'context';

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
  {
    command: '/rewind',
    description: 'Rewind to the last user message (edit and resend)',
    kind: 'local',
    aliases: ['/undo'],
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

/** Orchestrator-side context slash commands (/diff, /test, /pr). */
export const CONTEXT_SLASH_COMMANDS: SlashCommand[] = CHAT_SLASH_COMMANDS.filter(
  (item) => item.command !== '/review',
).map((item) => ({
  command: item.command,
  description: item.prompt,
  kind: 'context' as const,
  prompt: item.prompt,
  source: 'app' as const,
}));

/** @deprecated Use CONTEXT_SLASH_COMMANDS — kept for older imports. */
export const PROMPT_SLASH_COMMANDS: SlashCommand[] = CONTEXT_SLASH_COMMANDS;

export { mergeChatMessages } from './chat-sync.js';

export {
  activeToolItem,
  adoptParentClaudeSessionId,
  appendStreamText,
  applyStreamEvent,
  claudeResultErrorMessage,
  coalesceTimelineText,
  completeRunningTools,
  isNestedSubagentEvent,
  isSubagentItem,
  isTopLevelClaudeResult,
  parentStreamTextDelta,
  runningSubagentItems,
  visibleAssistantContent,
  visibleSubagentItems,
  type StreamPart,
  type ToolActivityItem,
} from './stream-timeline.js';

export {
  buildAskUserQuestionUpdatedInput,
  extractPlanFilePath,
  extractPlanFilePathsFromLog,
  extractPlanFromInput,
  isClaudePlansPath,
  parseAskUserQuestions,
} from './permission-tools.js';

export {
  buildCompactContinuePrompt,
  buildImplementPlanPrompt,
  chatSessionTemplateById,
  instructionGradeFindings,
  isGitMutatingSessionTemplate,
  isInstructionOfferSessionTemplate,
  shouldOfferInstructionDraft,
  uniqueSessionTitle,
  CHAT_SESSION_TEMPLATES,
  CHAT_TITLE_MAX_LENGTH,
  GIT_MUTATING_SESSION_TEMPLATES,
  INSTRUCTION_GRADE_FINDING_CATEGORIES,
  INSTRUCTION_OFFER_SESSION_TEMPLATES,
  LISTED_CHAT_SESSION_TEMPLATES,
  SESSION_GRADE_FINDING_CATEGORIES,
  SESSION_GRADE_FINDING_LABELS,
  SESSION_GRADE_LABELS,
  SESSION_GRADE_SCORES,
  type ChatSession,
  type ChatSessionTemplate,
  type ChatSessionTemplateId,
  type ChatSessionTitleSource,
  type CreateChatSessionRequest,
  type GradeChatSessionRequest,
  type SessionGrade,
  type SessionGradeAnalysis,
  type SessionGradeFinding,
  type SessionGradeFindingCategory,
  type SessionGradeFindingSeverity,
  type SessionGradeScore,
  type SessionGradeStats,
  type UpdateChatSessionRequest,
} from './chat-session.js';

export {
  buildPlanQaPairsFromAskUserAnswer,
  collectPlanHandoffFilePaths,
  extractAskUserQuestionPairsFromLog,
  extractMentionedFilePathsFromText,
  extractToolFilePathsFromLog,
  mergeUniqueFilePaths,
  mergeUniquePlanQaPairs,
  type PlanBuildHandoffContext,
  type PlanQaPair,
} from './plan-handoff.js';

export {
  addTokenUsage,
  buildSessionContextUsage,
  compactThresholdTokensForWindow,
  contextTokensFromUsage,
  emptyTokenUsage,
  hasCrossedCompactThreshold,
  isContextUsageHot,
  totalTokensFromUsage,
  CONTEXT_USAGE_HOT_PERCENT,
  type SessionContextTurn,
  type SessionContextUsage,
  type TokenUsageBreakdown,
} from './session-context.js';

export type {
  ApplyInstructionFileRequest,
  ApplyInstructionFileResponse,
  GenerateInstructionDraftRequest,
  InstructionDraft,
  InstructionFile,
  InstructionFileKind,
  InstructionFileScope,
} from './instruction-files.js';

export {
  evaluateMergeReadiness,
  parsePullRequestNumber,
  pullRequestMatchesQuery,
  rollupChecks,
  type MergeReadiness,
} from './pull-request.js';

