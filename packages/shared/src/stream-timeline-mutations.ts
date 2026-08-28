import type { StreamPart, ToolActivityItem, ToolTaskInfo } from './stream-timeline-types.js';
import {
  isSubagentToolName,
  numberField,
  recordField,
  stringField,
} from './stream-timeline-subagent.js';

const TASK_EVENT_KINDS = new Set([
  'task_started',
  'task_progress',
  'task_updated',
  'task_notification',
]);

const NESTED_DETAIL_MAX = 80;

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

export function toolItemFields(part: Extract<StreamPart, { type: 'tool' }>): ToolActivityItem {
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

export function pushTool(
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

export function applyNestedSubagentEvent(
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

export function taskEventKind(event: Record<string, unknown>): string | undefined {
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

export function applyTaskEvent(parts: StreamPart[], event: Record<string, unknown>, kind: string): StreamPart[] {
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
      backgrounded: payload.is_backgrounded === true ? true : undefined,
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

export { taskFromToolInput, toolDetail };
