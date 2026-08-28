import type { StreamPart, ToolActivityItem } from './stream-timeline-types.js';

const SUBAGENT_TOOL_NAMES = new Set(['Task', 'Agent']);

export function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function recordField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Parent tool-use id on nested subagent stream messages, if any. */
export function parentToolUseId(
  event: Record<string, unknown> | null | undefined,
): string | undefined {
  return stringField(event?.parent_tool_use_id);
}

/**
 * True when this stream-json event belongs to a nested Task/Agent subagent.
 * Prefer `parent_tool_use_id`; some CLI versions omit it on the nested session's
 * own `result`, so a different `session_id` than the parent is also nested.
 */
export function isNestedSubagentEvent(
  event: Record<string, unknown> | null | undefined,
  parentSessionId?: string | null,
): boolean {
  if (parentToolUseId(event)) return true;
  const sid = stringField(event?.session_id);
  return Boolean(parentSessionId && sid && sid !== parentSessionId);
}

/** True when Claude finished the parent turn (not a nested Explore/Task result). */
export function isTopLevelClaudeResult(
  event: Record<string, unknown> | null | undefined,
  parentSessionId?: string | null,
): boolean {
  return String(event?.type ?? '') === 'result' && !isNestedSubagentEvent(event, parentSessionId);
}

/**
 * Keep the parent Claude session id. Nested Explore/Task results often have
 * their own `session_id` and must not replace it (resume would follow the child).
 */
export function adoptParentClaudeSessionId(
  current: string | null | undefined,
  event: Record<string, unknown> | null | undefined,
): string | null {
  if (!event) return current ?? null;
  if (parentToolUseId(event)) return current ?? null;
  if (String(event.type ?? '') === 'result') return current ?? null;
  const sid = stringField(event.session_id);
  if (!sid) return current ?? null;
  if (!current || sid === current) return sid;
  // A later `system` init can rotate the parent id; nested traffic is not `system`.
  if (String(event.type ?? '') === 'system') return sid;
  return current;
}

/** Error text from a Claude `result` event, if the turn failed. */
export function claudeResultErrorMessage(
  event: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!event) return undefined;
  const subtype = stringField(event.subtype);
  const isError = event.is_error === true || Boolean(subtype && subtype.startsWith('error'));
  if (!isError) return undefined;
  if (typeof event.result === 'string' && event.result.trim()) return event.result.trim();
  if (subtype) return `Claude ended this turn (${subtype}).`;
  return 'Claude ended this turn with an error.';
}

export function parentStreamTextDelta(
  event: Record<string, unknown>,
  parentSessionId?: string | null,
): string | undefined {
  if (isNestedSubagentEvent(event, parentSessionId)) return undefined;
  if (String(event.type ?? '') !== 'stream_event') return undefined;
  const nested = recordField(event.event);
  const delta = recordField(nested?.delta);
  if (delta?.type === 'text_delta') return stringField(delta.text);
  return undefined;
}

/** Hide synthetic placeholders so they never look like Claude's reply. */
export function visibleAssistantContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed || trimmed === '[no output]' || trimmed === '[stopped]') return '';
  return content;
}

export function isSubagentToolName(name: string): boolean {
  return SUBAGENT_TOOL_NAMES.has(name);
}

/** Task/Agent tool uses and background `task_*` entries shown as subagents. */
export function isSubagentItem(item: ToolActivityItem): boolean {
  if (isSubagentToolName(item.name)) return true;
  const taskType = item.task?.taskType;
  return taskType === 'local_agent' || taskType === 'local_bash' || Boolean(item.task?.taskId);
}

/** Subagent / background-task entries that are still running. */
export function runningSubagentItems(parts: StreamPart[]): ToolActivityItem[] {
  return parts.filter(
    (part): part is Extract<StreamPart, { type: 'tool' }> =>
      part.type === 'tool' && part.status === 'running' && isSubagentItem(part),
  );
}

/**
 * Subagent cards to render under an assistant turn.
 * Show them while the turn is streaming, or while any sibling is still running
 * (parent Ready must not hide a live Explore/Task). Once the turn is finished
 * and every row is done, return nothing so leftover Bash/Task chips do not
 * stick under a completed reply.
 */
export function visibleSubagentItems(parts: StreamPart[], streaming: boolean): ToolActivityItem[] {
  const items = parts.filter(
    (part): part is Extract<StreamPart, { type: 'tool' }> =>
      part.type === 'tool' && isSubagentItem(part),
  );
  if (items.length === 0) return [];
  if (streaming || items.some((item) => item.status === 'running')) return items;
  return [];
}
