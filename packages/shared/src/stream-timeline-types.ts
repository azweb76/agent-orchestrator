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
}

/** Ordered streaming timeline part for interleaved text + tool use. */
export type StreamPart =
  | { type: 'text'; id: string; text: string }
  | ({ type: 'tool' } & ToolActivityItem);
