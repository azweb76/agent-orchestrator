export interface ToolActivityItem {
  id: string;
  name: string;
  detail?: string;
  status: 'running' | 'done';
}

/** Ordered streaming timeline part for interleaved text + tool use. */
export type StreamPart =
  | { type: 'text'; id: string; text: string }
  | ({ type: 'tool' } & ToolActivityItem);

const NESTED_DETAIL_MAX = 80;

function toolDetail(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const subagent = typeof input.subagent_type === 'string' ? input.subagent_type.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (subagent && description) return `${subagent}: ${description}`;
  if (subagent || description) return subagent || description;
  return (
    (typeof input.file_path === 'string' && input.file_path) ||
    (typeof input.path === 'string' && input.path) ||
    (typeof input.command === 'string' && String(input.command).slice(0, 60)) ||
    (typeof input.pattern === 'string' && input.pattern) ||
    undefined
  );
}

function nestedSubagentParentId(event: Record<string, unknown> | null | undefined): string | undefined {
  const id = event?.parent_tool_use_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** True when this stream-json event belongs to a nested Task/Agent subagent. */
export function isNestedSubagentEvent(event: Record<string, unknown> | null | undefined): boolean {
  return Boolean(nestedSubagentParentId(event));
}

/** True when Claude finished the parent turn (not a nested Explore/Task result). */
export function isTopLevelClaudeResult(event: Record<string, unknown> | null | undefined): boolean {
  return String(event?.type ?? '') === 'result' && !isNestedSubagentEvent(event);
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
  const nested = event.event as Record<string, unknown> | undefined;
  const delta = nested?.delta as Record<string, unknown> | undefined;
  if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
    return delta.text;
  }
  const content =
    (event.message as { content?: unknown } | undefined)?.content ?? event.content;
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

function completeTools(parts: StreamPart[]): StreamPart[] {
  return parts.map((part) =>
    part.type === 'tool' && part.status === 'running' ? { ...part, status: 'done' as const } : part,
  );
}

function updateTool(
  parts: StreamPart[],
  toolId: string,
  patch: { detail?: string; status?: 'running' | 'done' },
): StreamPart[] {
  let found = false;
  const next = parts.map((part) => {
    if (part.type !== 'tool' || part.id !== toolId) return part;
    found = true;
    return {
      ...part,
      detail: patch.detail ?? part.detail,
      status: patch.status ?? part.status,
    };
  });
  return found ? next : parts;
}

function applyNestedSubagentEvent(
  parts: StreamPart[],
  event: Record<string, unknown>,
  parentToolId: string,
): StreamPart[] {
  const type = String(event.type ?? '');
  const text = nestedEventText(event);
  let next = parts;
  if (text && type !== 'result') {
    next = updateTool(next, parentToolId, {
      detail: clipToolDetail(text),
      status: 'running',
    });
  }
  if (type === 'result') {
    next = updateTool(next, parentToolId, {
      detail: text ? clipToolDetail(text) : undefined,
      status: 'done',
    });
  }
  return next;
}

function pushTool(
  parts: StreamPart[],
  name: string,
  detail: string | undefined,
  toolId?: string,
): StreamPart[] {
  const id = toolId || `${name}-${detail ?? ''}-${parts.length}`;
  const existingIndex = parts.findIndex(
    (part) =>
      part.type === 'tool' && (part.id === id || (part.name === name && part.status === 'running')),
  );
  if (existingIndex >= 0) {
    const next = [...parts];
    const prev = next[existingIndex] as Extract<StreamPart, { type: 'tool' }>;
    next[existingIndex] = {
      ...prev,
      id,
      name,
      detail: detail ?? prev.detail,
      status: 'running',
    };
    return next;
  }
  return [...parts, { type: 'tool', id, name, detail, status: 'running' }];
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

/**
 * Live text_delta from the parent turn only. Nested Explore/Task tokens must not
 * land in the assistant bubble.
 */
export function parentStreamTextDelta(event: Record<string, unknown>): string | undefined {
  if (isNestedSubagentEvent(event)) return undefined;
  if (String(event.type ?? '') !== 'stream_event') return undefined;
  const nested = event.event as Record<string, unknown> | undefined;
  const delta = nested?.delta as Record<string, unknown> | undefined;
  if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
    return delta.text;
  }
  return undefined;
}

/** Apply a Claude stream-json event into the ordered timeline. */
export function applyStreamEvent(parts: StreamPart[], event: Record<string, unknown>): StreamPart[] {
  const parentToolId = nestedSubagentParentId(event);
  if (parentToolId) {
    return applyNestedSubagentEvent(parts, event, parentToolId);
  }

  const type = String(event.type ?? '');
  const nested = (event.event as Record<string, unknown> | undefined) ?? undefined;
  const content =
    (event.message as { content?: unknown } | undefined)?.content ??
    nested?.content ??
    (event.content as unknown);

  let next = [...parts];

  if (type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        next = pushTool(
          next,
          String(b.name ?? 'tool'),
          toolDetail(b.input as Record<string, unknown> | undefined),
          typeof b.id === 'string' ? b.id : undefined,
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
      const block = nested.content_block as Record<string, unknown> | undefined;
      if (block?.type === 'tool_use') {
        next = pushTool(
          next,
          String(block.name ?? 'tool'),
          toolDetail(block.input as Record<string, unknown> | undefined),
          typeof block.id === 'string' ? block.id : undefined,
        );
      }
    }
  }

  if (type === 'user' || type === 'result') {
    next = completeTools(next);
  }

  if (
    type === 'tool_result' ||
    (Array.isArray(content) &&
      content.some((c) => (c as { type?: string })?.type === 'tool_result'))
  ) {
    next = completeTools(next);
  }

  if (type === 'user' && Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
        next = next.map((part) =>
          part.type === 'tool' && part.id === b.tool_use_id
            ? { ...part, status: 'done' as const }
            : part,
        );
      }
    }
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
    if (item.status === 'running') {
      return { id: item.id, name: item.name, detail: item.detail, status: item.status };
    }
  }
  const last = tools[tools.length - 1];
  return last
    ? { id: last.id, name: last.name, detail: last.detail, status: last.status }
    : undefined;
}

/** Extract tool chips only (legacy helper). */
export function extractToolActivity(
  event: Record<string, unknown>,
  prev: ToolActivityItem[],
): ToolActivityItem[] {
  const parts: StreamPart[] = prev.map((item) => ({ type: 'tool' as const, ...item }));
  return applyStreamEvent(parts, event)
    .filter((part): part is Extract<StreamPart, { type: 'tool' }> => part.type === 'tool')
    .map(({ id, name, detail, status }) => ({ id, name, detail, status }));
}
