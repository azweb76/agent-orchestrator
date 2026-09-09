import {
  applyTaskEvent,
  patchToolById,
  pushTool,
  taskEventKind,
  taskFromToolInput,
  toolDetail,
  toolItemFields,
} from './stream-timeline-mutations.js';
import { applyNestedSubagentEvent } from './stream-timeline-nested.js';
import {
  isNestedSubagentEvent,
  isSubagentItem,
  isTopLevelClaudeResult,
  parentToolUseId,
  recordField,
  stringField,
} from './stream-timeline-subagent.js';
import {
  applyImageBlock,
  applyStructuredToolInput,
  applyThinkingDelta,
  applyThinkingFromBlock,
  blockTextContent,
  parsePartialJsonObject,
} from './stream-timeline-blocks.js';
import type { StreamPart, ToolActivityItem } from './stream-timeline-types.js';

export type { StreamPart, ToolActivityItem, ToolTaskInfo, TimelineTodoItem } from './stream-timeline-types.js';
export { appendStreamThinking } from './stream-timeline-blocks.js';

export {
  adoptParentClaudeSessionId,
  claudeResultErrorMessage,
  isNestedSubagentEvent,
  isSubagentItem,
  isSubagentToolName,
  isTopLevelClaudeResult,
  parentStreamTextDelta,
  parentToolUseId,
  runningSubagentItems,
  visibleAssistantContent,
  visibleSubagentItems,
} from './stream-timeline-subagent.js';

export { completeRunningTools } from './stream-timeline-mutations.js';

function completeToolIds(
  parts: StreamPart[],
  results: { id: string; isError: boolean; content?: string }[],
): StreamPart[] {
  if (results.length === 0) return parts;
  const wanted = new Map(results.map((result) => [result.id, result]));
  const next = parts.map((part) => {
    if (part.type !== 'tool') return part;
    const hit = wanted.get(part.id) ?? (part.task?.taskId ? wanted.get(part.task.taskId) : undefined);
    if (!hit) return part;
    if (part.status === 'done' || part.status === 'error') {
      return hit.content && !part.result ? { ...part, result: hit.content } : part;
    }
    if (isSubagentItem(toolItemFields(part)) || part.task?.backgrounded) {
      return hit.content && !part.result ? { ...part, result: hit.content } : part;
    }
    return {
      ...part,
      status: hit.isError ? ('error' as const) : ('done' as const),
      result: hit.content ?? part.result,
    };
  });
  return next;
}

function completeNonSubagentTools(parts: StreamPart[]): StreamPart[] {
  return parts.map((part) => {
    if (part.type !== 'tool' || part.status !== 'running') return part;
    if (isSubagentItem(toolItemFields(part))) return part;
    return { ...part, status: 'done' as const };
  });
}

function toolResultIds(
  event: Record<string, unknown>,
  content: unknown,
): { id: string; isError: boolean; content?: string }[] {
  const results: { id: string; isError: boolean; content?: string }[] = [];
  const push = (value: unknown, isError: boolean, body: unknown) => {
    const id = stringField(value);
    if (!id) return;
    const text = blockTextContent(body);
    results.push({ id, isError, content: text || undefined });
  };
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_result') push(b.tool_use_id, b.is_error === true, b.content);
    }
  }
  if (String(event.type ?? '') === 'tool_result') {
    push(event.tool_use_id, event.is_error === true, event.content);
  }
  return results;
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
        const toolId = stringField(b.id);
        next = pushTool(
          next,
          name,
          toolDetail(input),
          toolId,
          taskFromToolInput(name, input),
          input,
        );
        next = applyStructuredToolInput(next, name, input, toolId);
      } else if (b.type === 'text' && typeof b.text === 'string' && b.text) {
        // Prefer live text_delta tokens for ordering; only seed if timeline is empty of text.
        if (!next.some((part) => part.type === 'text')) {
          next = appendStreamText(next, b.text);
        }
      } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
        next = applyThinkingFromBlock(next, b);
      } else if (b.type === 'image') {
        next = applyImageBlock(next, b);
      }
    }
  }

  if (type === 'stream_event' && nested) {
    next = applyThinkingDelta(next, nested);
    if (nested.type === 'content_block_start') {
      const block = recordField(nested.content_block);
      if (block?.type === 'tool_use') {
        const name = String(block.name ?? 'tool');
        const input = recordField(block.input);
        const toolId = stringField(block.id);
        next = pushTool(
          next,
          name,
          toolDetail(input),
          toolId,
          taskFromToolInput(name, input),
          input,
        );
        next = applyStructuredToolInput(next, name, input, toolId);
      } else if (block?.type === 'thinking' || block?.type === 'redacted_thinking') {
        next = applyThinkingFromBlock(next, block);
      } else if (block?.type === 'image') {
        next = applyImageBlock(next, block);
      }
    }
    if (nested.type === 'content_block_delta') {
      const delta = recordField(nested.delta);
      const index =
        typeof nested.index === 'number'
          ? nested.index
          : typeof nested.content_block_index === 'number'
            ? nested.content_block_index
            : undefined;
      if (delta?.type === 'input_json_delta') {
        const partial = stringField(delta.partial_json) ?? '';
        const toolId = stringField(nested.tool_use_id);
        if (toolId) {
          const current = next.find((part) => part.type === 'tool' && part.id === toolId);
          const inputJson = `${current && current.type === 'tool' ? (current.inputJson ?? '') : ''}${partial}`;
          const parsed = parsePartialJsonObject(inputJson);
          next = patchToolById(next, toolId, {
            inputJson,
            input: parsed,
            detail: parsed ? toolDetail(parsed) : undefined,
          });
          if (parsed && current && current.type === 'tool') {
            next = applyStructuredToolInput(next, current.name, parsed, toolId);
          }
        } else if (typeof index === 'number') {
          const tools = next.filter((part) => part.type === 'tool');
          const target = tools[index];
          if (target && target.type === 'tool') {
            const inputJson = `${target.inputJson ?? ''}${partial}`;
            const parsed = parsePartialJsonObject(inputJson);
            next = patchToolById(next, target.id, {
              inputJson,
              input: parsed,
              detail: parsed ? toolDetail(parsed) : undefined,
            });
            if (parsed) next = applyStructuredToolInput(next, target.name, parsed, target.id);
          }
        }
      }
    }
  }

  const results = toolResultIds(event, content);
  if (results.length > 0) {
    next = completeToolIds(next, results);
  }

  if (isTopLevelClaudeResult(event, parentSessionId)) {
    next = completeNonSubagentTools(next);
  }

  return next;
}

/**
 * Join timeline text parts for a single chat bubble.
 * Segments separated by tools stay on separate lines (paragraph breaks).
 */
export function coalesceTimelineText(parts: StreamPart[]): string {
  return parts
    .filter((part): part is Extract<StreamPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');
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
