import {
  contextTokensFromUsage,
  totalTokensFromUsage,
  type Message,
  type StreamPart,
  type TokenUsageBreakdown,
} from '@agent-orchestrator/shared';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function contentBlocks(content: unknown): Record<string, unknown>[] {
  if (!Array.isArray(content)) return [];
  return content.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

export function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  const parts: string[] = [];
  for (const block of contentBlocks(content)) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      parts.push(block.text);
    }
  }
  return parts.join('\n').trim();
}

export function isToolResultOnly(content: unknown): boolean {
  const blocks = contentBlocks(content);
  return blocks.length > 0 && blocks.every((block) => block.type === 'tool_result');
}

function toolDetail(name: string, input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  if (typeof input.skill === 'string' && input.skill) return input.skill;
  if (typeof input.file_path === 'string' && input.file_path) return input.file_path;
  if (typeof input.path === 'string' && input.path) return input.path;
  if (typeof input.command === 'string' && input.command) return String(input.command).slice(0, 80);
  if (typeof input.pattern === 'string' && input.pattern) return input.pattern;
  if ((name === 'Skill' || name === 'skill') && typeof input.name === 'string' && input.name) {
    return input.name;
  }
  return undefined;
}

export function timelineFromContent(content: unknown): StreamPart[] {
  const parts: StreamPart[] = [];
  contentBlocks(content).forEach((block, index) => {
    if (block.type !== 'tool_use') return;
    const name = String(block.name ?? 'tool');
    parts.push({
      type: 'tool',
      id: typeof block.id === 'string' ? block.id : `tool-${index}`,
      name,
      detail: toolDetail(name, asRecord(block.input) ?? undefined),
      status: 'done',
    });
  });
  return parts;
}

function positiveNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function parseTokenUsage(value: unknown): TokenUsageBreakdown | null {
  const usage = asRecord(value);
  if (!usage) return null;
  const parsed: TokenUsageBreakdown = {
    inputTokens: positiveNumber(usage.input_tokens) || positiveNumber(usage.inputTokens),
    outputTokens: positiveNumber(usage.output_tokens) || positiveNumber(usage.outputTokens),
    cacheCreationInputTokens:
      positiveNumber(usage.cache_creation_input_tokens) ||
      positiveNumber(usage.cacheCreationInputTokens),
    cacheReadInputTokens:
      positiveNumber(usage.cache_read_input_tokens) || positiveNumber(usage.cacheReadInputTokens),
  };
  if (totalTokensFromUsage(parsed) <= 0) return null;
  return parsed;
}

export function usageTokensFromMessage(message: Record<string, unknown> | null): number {
  const usage = parseTokenUsage(message?.usage);
  return usage ? totalTokensFromUsage(usage) : 0;
}

export function eventTimestamp(event: Record<string, unknown>): string | null {
  const raw = event.timestamp;
  if (typeof raw === 'string' && raw.trim()) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw.trim() : date.toISOString();
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export function eventModel(
  event: Record<string, unknown>,
  message: Record<string, unknown> | null,
): string | null {
  if (typeof message?.model === 'string' && message.model.trim()) return message.model.trim();
  if (typeof event.model === 'string' && event.model.trim()) return event.model.trim();
  return null;
}

export function isCompactEvent(event: Record<string, unknown>): boolean {
  const type = String(event.type ?? '').toLowerCase();
  const subtype = String(event.subtype ?? '').toLowerCase();
  return type.includes('compact') || subtype.includes('compact');
}

export function toolNamesFromContent(content: unknown): string[] {
  const names: string[] = [];
  for (const block of contentBlocks(content)) {
    if (block.type !== 'tool_use') continue;
    const name = String(block.name ?? '').trim();
    if (name) names.push(name);
  }
  return names;
}

export function fingerprint(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch {
    return '';
  }
}

export function makeMessage(id: number, role: Message['role'], content: unknown): Message {
  const text = textFromContent(content);
  const timeline = timelineFromContent(content);
  return {
    id: `session-file-${id}`,
    agentId: '',
    sessionId: '',
    role,
    content: text,
    attachments: [],
    metadata: timeline.length ? { timeline } : {},
    createdAt: new Date(0).toISOString(),
  };
}

export { contextTokensFromUsage };
