export interface ToolTaskInfo {
  taskId?: string;
  /** Claude Code task kind: `local_agent` (subagent) or `local_bash`. */
  taskType?: string;
  subagentType?: string;
  /** Stable task title from `task_started` / Task tool input. */
  description?: string;
  lastToolName?: string;
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
  status: 'running' | 'done';
  /** Present for Task/Agent tool uses and Claude `task_*` system events. */
  task?: ToolTaskInfo;
}

/** Ordered streaming timeline part for interleaved text + tool use. */
export type StreamPart =
  | { type: 'text'; id: string; text: string }
  | ({ type: 'tool' } & ToolActivityItem);

const TASK_EVENT_KINDS = new Set([
  'task_started',
  'task_progress',
  'task_updated',
  'task_notification',
]);

const SUBAGENT_TOOL_NAMES = new Set(['Task', 'Agent']);
const NESTED_DETAIL_MAX = 80;

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function recordField(value: unknown): Record<string, unknown> | undefined {
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

export const assistantTextDelta = parentStreamTextDelta;

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

function toolDetail(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const subagent = typeof input.subagent_type === 'string' ? input.subagent_type.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (subagent && description) return `${subagent}: ${description}`;
  if (subagent || description) return subagent || description;
  return (
    stringField(input.file_path) ||
    stringField(input.path) ||
    (typeof input.command === 'string' && String(input.command).slice(0, 60)) ||
    stringField(input.pattern) ||
    (typeof input.prompt === 'string' && String(input.prompt).slice(0, 80)) ||
    undefined
  );
}

function taskFromToolInput(
  name: string,
  input: Record<string, unknown> | undefined,
): ToolTaskInfo | undefined {
  if (!isSubagentToolName(name) || !input) return undefined;
  const description = stringField(input.description);
  const subagentType = stringField(input.subagent_type);
  if (!description && !subagentType) return { taskType: 'local_agent' };
  return {
    taskType: 'local_agent',
    description,
    subagentType,
  };
}

function mergeTask(prev?: ToolTaskInfo, patch?: ToolTaskInfo): ToolTaskInfo | undefined {
  if (!prev && !patch) return undefined;
  const merged: ToolTaskInfo = { ...prev };
  if (!patch) return merged;
  for (const [key, value] of Object.entries(patch) as Array<
    [keyof ToolTaskInfo, ToolTaskInfo[keyof ToolTaskInfo]]
  >) {
    if (value !== undefined) merged[key] = value as never;
  }
  return merged;
}

function toolItemFields(part: Extract<StreamPart, { type: 'tool' }>): ToolActivityItem {
  const item: ToolActivityItem = {
    id: part.id,
    name: part.name,
    status: part.status,
  };
  if (part.detail !== undefined) item.detail = part.detail;
  if (part.task) item.task = part.task;
  return item;
}

function completeTools(parts: StreamPart[]): StreamPart[] {
  return parts.map((part) =>
    part.type === 'tool' && part.status === 'running' ? { ...part, status: 'done' as const } : part,
  );
}

/** Mark every still-running tool done when the parent turn is over. */
export function completeRunningTools(parts: StreamPart[]): StreamPart[] {
  return completeTools(parts);
}

/**
 * On a parent `result`, finish ordinary tools but leave Task/Agent (and other
 * subagent rows) running until their own tool_result / task_notification.
 * Finalize still calls `completeRunningTools` once the process exits.
 */
function completeNonSubagentTools(parts: StreamPart[]): StreamPart[] {
  return parts.map((part) => {
    if (part.type !== 'tool' || part.status !== 'running') return part;
    if (isSubagentItem(toolItemFields(part))) return part;
    return { ...part, status: 'done' as const };
  });
}

function completeToolIds(parts: StreamPart[], ids: string[]): StreamPart[] {
  if (ids.length === 0) return parts;
  const wanted = new Set(ids);
  return parts.map((part) => {
    if (part.type !== 'tool' || part.status === 'done') return part;
    if (wanted.has(part.id) || (part.task?.taskId && wanted.has(part.task.taskId))) {
      return { ...part, status: 'done' as const };
    }
    return part;
  });
}

function findToolIndex(
  parts: StreamPart[],
  ids: { id?: string; taskId?: string; toolUseId?: string },
): number {
  return parts.findIndex((part) => {
    if (part.type !== 'tool') return false;
    if (ids.toolUseId && part.id === ids.toolUseId) return true;
    if (ids.id && part.id === ids.id) return true;
    if (ids.taskId && part.task?.taskId === ids.taskId) return true;
    return false;
  });
}

function clipToolDetail(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= NESTED_DETAIL_MAX) return compact;
  return `${compact.slice(0, NESTED_DETAIL_MAX - 1)}…`;
}

function nestedEventText(event: Record<string, unknown>): string | undefined {
  const type = String(event.type ?? '');
  if (type === 'result' && typeof event.result === 'string' && event.result.trim()) {
    return event.result;
  }
  const nested = recordField(event.event);
  const delta = recordField(nested?.delta);
  if (delta?.type === 'text_delta') return stringField(delta.text);
  const content = recordField(event.message)?.content ?? event.content;
  if (Array.isArray(content)) {
    const texts = content
      .map((block) => {
        if (!block || typeof block !== 'object') return '';
        const item = block as Record<string, unknown>;
        return item.type === 'text' && typeof item.text === 'string' ? item.text : '';
      })
      .filter(Boolean);
    if (texts.length > 0) return texts.join('');
  }
  if (typeof content === 'string' && content.trim()) return content;
  return undefined;
}

function pushTool(
  parts: StreamPart[],
  name: string,
  detail: string | undefined,
  toolId?: string,
  task?: ToolTaskInfo,
): StreamPart[] {
  const id = toolId || `${name}-${detail ?? ''}-${parts.length}`;
  const existingIndex = parts.findIndex((part) => {
    if (part.type !== 'tool') return false;
    if (toolId && part.id === toolId) return true;
    if (part.id === id) return true;
    if (task?.taskId && part.task?.taskId === task.taskId) return true;
    // Only fall back to name when this event has no id — otherwise parallel
    // Task/Agent calls of the same name would collapse into one row.
    if (!toolId && !task?.taskId && part.name === name && part.status === 'running') return true;
    return false;
  });
  if (existingIndex >= 0) {
    const next = [...parts];
    const prev = next[existingIndex] as Extract<StreamPart, { type: 'tool' }>;
    next[existingIndex] = {
      ...prev,
      id,
      name,
      detail: detail ?? prev.detail,
      status: 'running',
      task: mergeTask(prev.task, task),
    };
    return next;
  }
  const item: Extract<StreamPart, { type: 'tool' }> = {
    type: 'tool',
    id,
    name,
    status: 'running',
  };
  if (detail !== undefined) item.detail = detail;
  if (task) item.task = task;
  return [...parts, item];
}

function patchTool(
  parts: StreamPart[],
  index: number,
  patch: {
    name?: string;
    detail?: string;
    status?: 'running' | 'done';
    task?: ToolTaskInfo;
  },
): StreamPart[] {
  const prev = parts[index];
  if (!prev || prev.type !== 'tool') return parts;
  const next = [...parts];
  next[index] = {
    ...prev,
    name: patch.name ?? prev.name,
    detail: patch.detail ?? prev.detail,
    status: patch.status ?? prev.status,
    task: mergeTask(prev.task, patch.task),
  };
  return next;
}

function updateParentActivity(
  parts: StreamPart[],
  parentId: string,
  lastToolName: string | undefined,
  detail: string | undefined,
): StreamPart[] {
  const index = findToolIndex(parts, { toolUseId: parentId, id: parentId });
  if (index < 0) return parts;
  return patchTool(parts, index, {
    detail,
    task: lastToolName ? { lastToolName } : undefined,
  });
}

function applyNestedSubagentEvent(
  parts: StreamPart[],
  event: Record<string, unknown>,
  parentId: string,
): StreamPart[] {
  const type = String(event.type ?? '');
  const nested = recordField(event.event);
  const content = recordField(event.message)?.content ?? nested?.content ?? event.content;
  let next = parts;
  let usedToolUse = false;

  if (type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        usedToolUse = true;
        next = updateParentActivity(
          next,
          parentId,
          stringField(b.name),
          toolDetail(recordField(b.input)),
        );
      }
    }
  }

  if (type === 'stream_event' && nested?.type === 'content_block_start') {
    const block = recordField(nested.content_block);
    if (block?.type === 'tool_use') {
      usedToolUse = true;
      next = updateParentActivity(
        next,
        parentId,
        stringField(block.name),
        toolDetail(recordField(block.input)),
      );
    }
  }

  const text = nestedEventText(event);
  if (text && type !== 'result' && !usedToolUse) {
    const index = findToolIndex(next, { toolUseId: parentId, id: parentId });
    if (index >= 0) {
      next = patchTool(next, index, { detail: clipToolDetail(text), status: 'running' });
    }
  }

  if (type === 'result') {
    const index = findToolIndex(next, { toolUseId: parentId, id: parentId });
    if (index >= 0) {
      next = patchTool(next, index, {
        detail: text ? clipToolDetail(text) : undefined,
        status: 'done',
      });
    }
  }

  return next;
}

function taskEventKind(event: Record<string, unknown>): string | undefined {
  const type = String(event.type ?? '');
  const subtype = stringField(event.subtype);
  if (type === 'system' && subtype && TASK_EVENT_KINDS.has(subtype)) return subtype;
  if (TASK_EVENT_KINDS.has(type)) return type;
  return undefined;
}

function readUsage(event: Record<string, unknown>): ToolTaskInfo {
  const usage = recordField(event.usage) ?? event;
  return {
    durationMs: numberField(usage.duration_ms),
    toolUses: numberField(usage.tool_uses),
    totalTokens: numberField(usage.total_tokens),
  };
}

function taskName(taskType: string | undefined, fallback = 'Task'): string {
  if (taskType === 'local_bash') return 'Bash';
  if (taskType === 'local_agent') return 'Agent';
  return fallback;
}

function applyTaskEvent(parts: StreamPart[], event: Record<string, unknown>, kind: string): StreamPart[] {
  const payload = { ...recordField(event.data), ...event };
  const taskId = stringField(payload.task_id);
  const toolUseId = stringField(payload.tool_use_id);
  const description = stringField(payload.description);
  const subagentType = stringField(payload.subagent_type);
  const taskType = stringField(payload.task_type);
  const usage = readUsage(payload);
  const index = findToolIndex(parts, { toolUseId, taskId, id: toolUseId });

  if (kind === 'task_started') {
    const task: ToolTaskInfo = {
      taskId,
      taskType: taskType ?? (subagentType ? 'local_agent' : undefined),
      subagentType,
      description,
      ...usage,
    };
    if (index >= 0) {
      return patchTool(parts, index, { detail: description, status: 'running', task });
    }
    return pushTool(parts, taskName(task.taskType), description, toolUseId ?? taskId, task);
  }

  if (kind === 'task_progress') {
    const lastToolName = stringField(payload.last_tool_name);
    const task: ToolTaskInfo = {
      taskId,
      taskType,
      subagentType,
      lastToolName,
      ...usage,
    };
    if (index >= 0) {
      const prev = parts[index];
      const alreadyDone = prev?.type === 'tool' && prev.status === 'done';
      return patchTool(parts, index, {
        detail: description,
        status: alreadyDone ? 'done' : 'running',
        task,
      });
    }
    return pushTool(parts, taskName(taskType), description, toolUseId ?? taskId, {
      ...task,
      description,
    });
  }

  if (kind === 'task_updated') {
    const patch = recordField(payload.patch);
    const status = stringField(patch?.status) ?? stringField(payload.status);
    const done = status === 'completed' || status === 'failed';
    const task: ToolTaskInfo = {
      taskId,
      outcome: status === 'failed' || status === 'completed' ? status : undefined,
      ...usage,
    };
    if (index >= 0) {
      return patchTool(parts, index, { status: done ? 'done' : undefined, task });
    }
    return parts;
  }

  if (kind === 'task_notification') {
    const status = stringField(payload.status);
    const summary = stringField(payload.summary);
    const task: ToolTaskInfo = {
      taskId,
      summary,
      outcome: status === 'failed' ? 'failed' : 'completed',
      ...usage,
    };
    if (index >= 0) {
      return patchTool(parts, index, { status: 'done', task });
    }
    const created = pushTool(
      parts,
      taskName(taskType, 'Agent'),
      summary,
      toolUseId ?? taskId,
      task,
    );
    const createdIndex = findToolIndex(created, { toolUseId, taskId, id: toolUseId ?? taskId });
    return createdIndex >= 0 ? patchTool(created, createdIndex, { status: 'done' }) : created;
  }

  return parts;
}

function toolResultIds(event: Record<string, unknown>, content: unknown): string[] {
  const ids: string[] = [];
  const push = (value: unknown) => {
    const id = stringField(value);
    if (id) ids.push(id);
  };
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_result') push(b.tool_use_id);
    }
  }
  if (String(event.type ?? '') === 'tool_result') push(event.tool_use_id);
  return ids;
}

/** Append a text token into the timeline, keeping tools interleaved in arrival order. */
export function appendStreamText(parts: StreamPart[], token: string): StreamPart[] {
  if (!token) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === 'text') {
    const next = [...parts];
    next[next.length - 1] = { ...last, text: last.text + token };
    return next;
  }
  return [...parts, { type: 'text', id: `text-${parts.length}`, text: token }];
}

/** Apply a Claude stream-json event into the ordered timeline. */
export function applyStreamEvent(
  parts: StreamPart[],
  event: Record<string, unknown>,
  parentSessionId?: string | null,
): StreamPart[] {
  const type = String(event.type ?? '');
  const nested = recordField(event.event);
  const content =
    recordField(event.message)?.content ?? nested?.content ?? (event.content as unknown);

  const taskKind = taskEventKind(event);
  if (taskKind) {
    return applyTaskEvent(parts, event, taskKind);
  }

  const parentId = parentToolUseId(event);
  if (parentId) {
    return applyNestedSubagentEvent(parts, event, parentId);
  }

  if (isNestedSubagentEvent(event, parentSessionId)) {
    // Nested session result/text without parent_tool_use_id — do not end sibling tools.
    return parts;
  }

  let next = [...parts];

  if (type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const name = String(b.name ?? 'tool');
        const input = recordField(b.input);
        next = pushTool(
          next,
          name,
          toolDetail(input),
          stringField(b.id),
          taskFromToolInput(name, input),
        );
      } else if (b.type === 'text' && typeof b.text === 'string' && b.text) {
        // Prefer live text_delta tokens for ordering; only seed if timeline is empty of text.
        if (!next.some((part) => part.type === 'text')) {
          next = appendStreamText(next, b.text);
        }
      }
    }
  }

  if (type === 'stream_event' && nested) {
    if (nested.type === 'content_block_start') {
      const block = recordField(nested.content_block);
      if (block?.type === 'tool_use') {
        const name = String(block.name ?? 'tool');
        const input = recordField(block.input);
        next = pushTool(
          next,
          name,
          toolDetail(input),
          stringField(block.id),
          taskFromToolInput(name, input),
        );
      }
    }
  }

  const resultIds = toolResultIds(event, content);
  if (resultIds.length > 0) {
    next = completeToolIds(next, resultIds);
  }

  if (isTopLevelClaudeResult(event, parentSessionId)) {
    next = completeNonSubagentTools(next);
  }

  return next;
}

/** Join all timeline text parts into one string (single chat bubble). */
export function coalesceTimelineText(parts: StreamPart[]): string {
  return parts
    .filter((part): part is Extract<StreamPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** Prefer a running tool; otherwise the most recent tool event. */
export function activeToolItem(parts: StreamPart[]): ToolActivityItem | undefined {
  const tools = parts.filter(
    (part): part is Extract<StreamPart, { type: 'tool' }> => part.type === 'tool',
  );
  for (let i = tools.length - 1; i >= 0; i -= 1) {
    const item = tools[i]!;
    if (item.status === 'running') return toolItemFields(item);
  }
  const last = tools[tools.length - 1];
  return last ? toolItemFields(last) : undefined;
}

/** Extract tool chips only (legacy helper). */
export function extractToolActivity(
  event: Record<string, unknown>,
  prev: ToolActivityItem[],
): ToolActivityItem[] {
  const parts: StreamPart[] = prev.map((item) => ({ type: 'tool' as const, ...item }));
  return applyStreamEvent(parts, event)
    .filter((part): part is Extract<StreamPart, { type: 'tool' }> => part.type === 'tool')
    .map((part) => toolItemFields(part));
}
