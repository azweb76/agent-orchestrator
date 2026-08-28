import type { StreamPart } from '../stream-timeline.js';

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
