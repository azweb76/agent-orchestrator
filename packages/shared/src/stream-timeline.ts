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

function toolDetail(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  return (
    (typeof input.file_path === 'string' && input.file_path) ||
    (typeof input.path === 'string' && input.path) ||
    (typeof input.command === 'string' && String(input.command).slice(0, 60)) ||
    (typeof input.pattern === 'string' && input.pattern) ||
    undefined
  );
}

function completeTools(parts: StreamPart[]): StreamPart[] {
  return parts.map((part) =>
    part.type === 'tool' && part.status === 'running' ? { ...part, status: 'done' as const } : part,
  );
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

/** Apply a Claude stream-json event into the ordered timeline. */
export function applyStreamEvent(parts: StreamPart[], event: Record<string, unknown>): StreamPart[] {
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
          undefined,
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
