import {
  applyNestedSubagentEvent,
  applyTaskEvent,
  pushTool,
  taskEventKind,
  taskFromToolInput,
  toolDetail,
  toolItemFields,
} from './stream-timeline-mutations.js';
import {
  isNestedSubagentEvent,
  isSubagentItem,
  isTopLevelClaudeResult,
  parentToolUseId,
  recordField,
  stringField,
} from './stream-timeline-subagent.js';
import type { StreamPart, ToolActivityItem } from './stream-timeline-types.js';

export type { StreamPart, ToolActivityItem, ToolTaskInfo } from './stream-timeline-types.js';

export {
  adoptParentClaudeSessionId,
  claudeResultErrorMessage,
  isNestedSubagentEvent,
  isSubagentItem,
  isTopLevelClaudeResult,
  parentStreamTextDelta,
  parentToolUseId,
  runningSubagentItems,
  visibleAssistantContent,
  visibleSubagentItems,
} from './stream-timeline-subagent.js';

export { completeRunningTools } from './stream-timeline-mutations.js';

function completeToolIds(parts: StreamPart[], ids: string[]): StreamPart[] {
  if (ids.length === 0) return parts;
  const wanted = new Set(ids);
  return parts.map((part) => {
    if (part.type !== 'tool' || part.status === 'done') return part;
    // A backgrounded Task/Agent answers its tool_use immediately ("Async agent
    // launched successfully") while the subagent keeps working. Only
    // `task_updated` / `task_notification` may finish those rows.
    if (part.task?.backgrounded) return part;
    if (wanted.has(part.id) || (part.task?.taskId && wanted.has(part.task.taskId))) {
      return { ...part, status: 'done' as const };
    }
    return part;
  });
}

function completeNonSubagentTools(parts: StreamPart[]): StreamPart[] {
  return parts.map((part) => {
    if (part.type !== 'tool' || part.status !== 'running') return part;
    if (isSubagentItem(toolItemFields(part))) return part;
    return { ...part, status: 'done' as const };
  });
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
