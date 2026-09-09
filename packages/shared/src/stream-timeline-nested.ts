import type { StreamPart } from './stream-timeline-types.js';
import {
  findToolIndex,
  patchTool,
  toolDetail,
} from './stream-timeline-mutations.js';
import { recordField, stringField } from './stream-timeline-subagent.js';

const NESTED_DETAIL_MAX = 80;

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
