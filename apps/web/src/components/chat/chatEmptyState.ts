import type { AgentTask } from '@agent-orchestrator/shared';

export const CHAT_EMPTY_STATE_DESCRIPTION =
  'Sessions begin in plan mode. Describe what you want; Claude will explore, ask clarifying questions, and present a plan. Later sessions (Build, compact-and-continue, and other kickoffs) appear one after another in this window. Type / for commands, /clear to reset this session, or /rewind to restore the last prompt.';

/** Listed Brain Tasks shown as empty-state kickoffs (no separate session-template menu). */
export function listedTasksForEmptyState(tasks: AgentTask[]): AgentTask[] {
  return tasks.filter((item) => item.listed);
}
