import type { ChatMention } from '../chat-mentions.js';
import type { Agent, EffortLevel, MessageAttachment, PermissionMode } from './entities.js';

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

export interface CreateWorktreeFromIssueRequest {
  /** Issue number in the workspace repository. */
  issueNumber?: number;
  /** `owner/repo#n` or a GitHub issue URL (overrides issueNumber when set). */
  reference?: string;
  name?: string;
  baseBranch?: string;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
}

/**
 * Create a new branch + agent from a free-form goal.
 * Uses the built-in `from-goal` session profile for model / effort / permissions /
 * system prompt / allowed tools / prompt template.
 */
export interface CreateWorktreeFromGoalRequest {
  goal: string;
  name?: string;
  /** Base ref to branch from (defaults to workspace default branch). */
  baseBranch?: string;
}

/**
 * @deprecated Use {@link CreateWorktreeFromGoalRequest}. Kept for older clients;
 * `idea` maps to `goal`. Optional model/effort/permissionMode are ignored in favor
 * of the `from-goal` session profile.
 */
export interface CreateWorktreeFromIdeaRequest {
  idea: string;
  name?: string;
  baseBranch?: string;
  model?: string;
  effort?: EffortLevel;
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
  /** Required when the worktree has local changes; ignored for push-only. */
  message?: string;
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

export type { ChatMention, ChatMentionKind, WorktreeFileEntry } from '../chat-mentions.js';
export { chatMentionLabel, formatChatMentionToken } from '../chat-mentions.js';

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
  /** Set when spend caps block sending this queued message. */
  blockedReason?: import('../app-settings.js').SpendCapBlockReason | null;
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

export interface UpdateAgentRequest {
  /** Per-agent autopilot override; `null` clears the override (inherit global). */
  autopilot?: boolean | null;
}

export interface CreatePrRequest {
  title: string;
  body?: string;
  base?: string;
  /** Open the pull request as a draft. Defaults to true. */
  draft?: boolean;
}
