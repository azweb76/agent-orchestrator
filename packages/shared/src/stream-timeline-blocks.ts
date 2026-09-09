import type { StreamPart, TimelineTodoItem } from './stream-timeline-types.js';
import { recordField, stringField } from './stream-timeline-subagent.js';

export function appendStreamThinking(
  parts: StreamPart[],
  token: string,
  redacted = false,
): StreamPart[] {
  if (!token && !redacted) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === 'thinking' && last.redacted === redacted) {
    const next = [...parts];
    next[next.length - 1] = { ...last, text: last.text + token };
    return next;
  }
  return [
    ...parts,
    { type: 'thinking', id: `thinking-${parts.length}`, text: token, redacted },
  ];
}

export function blockTextContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const item = block as Record<string, unknown>;
      if (item.type === 'text' && typeof item.text === 'string') return item.text;
      if (typeof item.text === 'string') return item.text;
      return '';
    })
    .filter(Boolean)
    .join('');
}

function unifiedDiff(path: string | undefined, oldText: string, newText: string): string {
  const header = `--- a/${path ?? 'file'}\n+++ b/${path ?? 'file'}`;
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const body = [
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n');
  return `${header}\n${body}`;
}

function parseTodos(input: Record<string, unknown> | undefined): TimelineTodoItem[] | undefined {
  const raw = input?.todos;
  if (!Array.isArray(raw)) return undefined;
  const items: TimelineTodoItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const content = stringField(row.content) ?? stringField(row.activeForm);
    if (!content) continue;
    const parsed: TimelineTodoItem = {
      content,
      status: stringField(row.status) ?? 'pending',
    };
    const activeForm = stringField(row.activeForm);
    if (activeForm) parsed.activeForm = activeForm;
    items.push(parsed);
  }
  return items.length > 0 ? items : undefined;
}

function upsertByToolUse(
  parts: StreamPart[],
  type: 'diff' | 'todo_list',
  toolUseId: string | undefined,
  create: () => StreamPart,
  patch: (prev: StreamPart) => StreamPart,
): StreamPart[] {
  const index = parts.findIndex((part) => {
    if (part.type !== type) return false;
    if (!toolUseId) return false;
    return part.toolUseId === toolUseId;
  });
  if (index >= 0) {
    const next = [...parts];
    next[index] = patch(next[index]!);
    return next;
  }
  return [...parts, create()];
}

export function applyStructuredToolInput(
  parts: StreamPart[],
  name: string,
  input: Record<string, unknown> | undefined,
  toolUseId?: string,
): StreamPart[] {
  if (!input) return parts;
  let next = parts;

  if (name === 'TodoWrite') {
    const items = parseTodos(input);
    if (items) {
      next = upsertByToolUse(
        next,
        'todo_list',
        toolUseId,
        () => ({ type: 'todo_list', id: `todos-${toolUseId ?? next.length}`, items, toolUseId }),
        (prev) => (prev.type === 'todo_list' ? { ...prev, items } : prev),
      );
    }
  }

  if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') {
    const path = stringField(input.file_path) ?? stringField(input.path);
    const oldText = stringField(input.old_string) ?? '';
    const newText = stringField(input.new_string) ?? stringField(input.content) ?? '';
    if (oldText || (name !== 'Write' && newText)) {
      const diff =
        stringField(input.diff) ??
        (oldText || newText ? unifiedDiff(path, oldText, newText) : undefined);
      if (diff) {
        next = upsertByToolUse(
          next,
          'diff',
          toolUseId,
          () => ({ type: 'diff', id: `diff-${toolUseId ?? next.length}`, path, diff, toolUseId }),
          (prev) => (prev.type === 'diff' ? { ...prev, path, diff } : prev),
        );
      }
    } else if (stringField(input.diff)) {
      const diff = stringField(input.diff)!;
      next = upsertByToolUse(
        next,
        'diff',
        toolUseId,
        () => ({ type: 'diff', id: `diff-${toolUseId ?? next.length}`, path, diff, toolUseId }),
        (prev) => (prev.type === 'diff' ? { ...prev, path, diff } : prev),
      );
    }
  }

  return next;
}

export function applyImageBlock(parts: StreamPart[], block: Record<string, unknown>): StreamPart[] {
  const source = recordField(block.source) ?? block;
  const mimeType = stringField(source.media_type) ?? stringField(block.mimeType);
  const data = stringField(source.data) ?? stringField(block.data);
  const url = stringField(block.url) ?? stringField(source.url);
  const alt = stringField(block.alt) ?? stringField(block.name);
  if (!data && !url) return parts;
  return [...parts, { type: 'image', id: stringField(block.id) ?? `image-${parts.length}`, mimeType, url, alt, data }];
}

export function applyThinkingFromBlock(
  parts: StreamPart[],
  block: Record<string, unknown> | undefined,
): StreamPart[] {
  if (!block) return parts;
  if (block.type === 'redacted_thinking') {
    return appendStreamThinking(parts, stringField(block.data) ?? '', true);
  }
  if (block.type === 'thinking') {
    const text = stringField(block.thinking) ?? stringField(block.text) ?? '';
    return text ? appendStreamThinking(parts, text) : parts;
  }
  return parts;
}

export function applyThinkingDelta(
  parts: StreamPart[],
  nested: Record<string, unknown> | undefined,
): StreamPart[] {
  const delta = recordField(nested?.delta);
  if (!delta) return parts;
  if (delta.type === 'thinking_delta') {
    return appendStreamThinking(parts, stringField(delta.thinking) ?? stringField(delta.text) ?? '');
  }
  return parts;
}

export function parsePartialJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
