export interface ToolTaskInfo {
  taskId?: string;
  /** Claude Code task kind: `local_agent` (subagent) or `local_bash`. */
  taskType?: string;
  subagentType?: string;
  /** Stable task title from `task_started` / Task tool input. */
  description?: string;
  lastToolName?: string;
  /** True for tasks the CLI runs in the background (`task_started.is_backgrounded`). */
  backgrounded?: boolean;
  summary?: string;
  durationMs?: number;
  toolUses?: number;
  totalTokens?: number;
  outcome?: 'completed' | 'failed';
}

export interface ToolActivityItem {
  id: string;
  name: string;
  detail?: string;
  status: 'running' | 'done' | 'error';
  /** Present for Task/Agent tool uses and Claude `task_*` system events. */
  task?: ToolTaskInfo;
  /** Parsed tool_use input when known. */
  input?: Record<string, unknown>;
  /** Accumulated `input_json_delta` payload. */
  inputJson?: string;
  /** tool_result body when known. */
  result?: string;
}

export interface TimelineTodoItem {
  content: string;
  status: string;
  activeForm?: string;
}

/** Ordered streaming timeline part for interleaved text + tool use. */
export type StreamPart =
  | { type: 'text'; id: string; text: string }
  | { type: 'thinking'; id: string; text: string; redacted?: boolean }
  | ({ type: 'tool' } & ToolActivityItem)
  | { type: 'tool_result'; id: string; toolUseId: string; content: string; isError?: boolean }
  | { type: 'diff'; id: string; path?: string; diff: string; toolUseId?: string }
  | { type: 'todo_list'; id: string; items: TimelineTodoItem[]; toolUseId?: string }
  | { type: 'image'; id: string; mimeType?: string; url?: string; alt?: string; data?: string };
