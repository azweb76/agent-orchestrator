import type { ChildProcess } from 'node:child_process';

export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  /** Present on nested subagent messages; a top-level turn result omits this. */
  parent_tool_use_id?: string;
  event?: {
    delta?: {
      type?: string;
      text?: string;
    };
  };
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  [key: string]: unknown;
}

export type ClaudePermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions';

export interface ClaudePermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseId?: string;
}

export interface ClaudeEventMeta {
  /** True while catching up on log bytes written before this monitor attached. */
  replay: boolean;
}

export interface ClaudeRunOptions {
  cwd: string;
  prompt: string;
  model?: string;
  /** Claude Code `--effort` level. */
  effort?: string;
  sessionId?: string | null;
  allowedTools?: string;
  permissionMode?: ClaudePermissionMode;
  /** Absolute image paths to reference in the prompt for Claude's Read tool. */
  imagePaths?: string[];
  /** Resolved @-mention file/diff context appended to the prompt. */
  mentionContext?: string;
  onEvent?: (event: ClaudeStreamEvent, meta?: ClaudeEventMeta) => void;
  /** Interactive tool permission / AskUserQuestion / ExitPlanMode requests. */
  onPermissionRequest?: (request: ClaudePermissionRequest) => void;
  /** Called after historical log lines have been replayed (reattach catch-up). */
  onCatchUp?: () => void;
  /** Called once the detached process has been spawned (pid + log path). */
  onStarted?: (handle: ClaudeRunHandle) => void;
  /**
   * When aborted, the Claude process is killed. Do not wire this to HTTP disconnect /
   * server shutdown — only to explicit stop requests.
   */
  signal?: AbortSignal;
}

export interface ClaudeRunHandle {
  pid: number;
  logPath: string;
}

export interface ClaudeRunResult {
  result: string;
  sessionId: string | null;
  events: ClaudeStreamEvent[];
  stopped: boolean;
  /** Set when the parent `result` event reports an error subtype. */
  error?: string;
}

export interface TrackedRun {
  pid: number;
  logPath: string;
  proc?: ChildProcess;
  /** Write end for control_response / user messages. Reopened after orchestrator restart. */
  stdin: NodeJS.WritableStream | null;
  stdinFifoPath: string | null;
  /** Detached process that keeps the stdin FIFO open across orchestrator restarts. */
  holderPid: number | null;
  pendingPermissions: Map<string, ClaudePermissionRequest>;
  /** True when stdin is available for interactive permission replies. */
  canRespondToPermissions: boolean;
  /** Agent permission mode for this run (controls auto-allow vs UI prompts). */
  permissionMode: ClaudePermissionMode;
}
