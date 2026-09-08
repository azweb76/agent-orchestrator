import {
  emptyAttributionChars,
  parentToolUseId,
  type ContextAttributionChars,
  type ContextAttributionKey,
} from '@agent-orchestrator/shared';
import { asRecord, contentBlocks, isCompactEvent } from './claude-session-parse-helpers.js';

interface TrackedToolUse {
  name: string;
  path: string | null;
}

export interface AttributionAccumulator {
  chars: ContextAttributionChars;
  toolUses: Map<string, TrackedToolUse>;
}

export function createAttributionAccumulator(): AttributionAccumulator {
  return { chars: emptyAttributionChars(), toolUses: new Map() };
}

export function resetAttributionAccumulator(acc: AttributionAccumulator): void {
  acc.chars = emptyAttributionChars();
  acc.toolUses.clear();
}

function addChars(acc: AttributionAccumulator, key: ContextAttributionKey, amount: number): void {
  if (amount > 0) acc.chars[key] += amount;
}

function textLength(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) total += textLength(item);
    return total;
  }
  const record = asRecord(value);
  if (!record) return 0;
  if (typeof record.text === 'string') return record.text.length;
  if (typeof record.content === 'string') return record.content.length;
  if (record.content != null) return textLength(record.content);
  if (record.input != null) {
    try {
      return JSON.stringify(record.input).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

function pathFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ['file_path', 'path', 'filename', 'relativePath', 'filePath'] as const) {
    const item = record[key];
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  const nested = asRecord(record.file);
  if (nested && typeof nested.filename === 'string' && nested.filename.trim()) {
    return nested.filename.trim();
  }
  return null;
}

function classifyPath(raw: string | null): ContextAttributionKey | null {
  if (!raw) return null;
  const path = raw.replace(/\\/g, '/').toLowerCase();
  const base = path.split('/').pop() ?? path;
  if (base === 'claude.md' || base === 'agents.md') return 'instruction_files';
  if (base === 'skill.md' || path.includes('/skills/')) return 'skills';
  return null;
}

function classifyPlainText(text: string): ContextAttributionKey {
  const lower = text.toLowerCase();
  if (
    lower.includes('## orchestrator memory') ||
    lower.includes('durable notes when relevant')
  ) {
    return 'memory';
  }
  if (lower.includes('<system-reminder>')) {
    if (lower.includes('claude.md') || lower.includes('agents.md')) return 'instruction_files';
    if (lower.includes('skill.md') || lower.includes('/skills/')) return 'skills';
    if (lower.includes('memory')) return 'memory';
    return 'other';
  }
  return 'conversation';
}

function classifyTool(name: string, path: string | null): ContextAttributionKey {
  const tool = name.trim().toLowerCase();
  if (tool === 'skill' || tool === 'slashcommand') return 'skills';
  const fromPath = classifyPath(path);
  if (fromPath) return fromPath;
  return 'tool_results';
}

function observeToolUse(acc: AttributionAccumulator, block: Record<string, unknown>): void {
  const id = typeof block.id === 'string' ? block.id : '';
  const name = String(block.name ?? '').trim() || 'tool';
  const input = asRecord(block.input);
  const path =
    pathFromUnknown(input) ??
    (typeof input?.skill === 'string' ? input.skill : null) ??
    (typeof input?.name === 'string' ? input.name : null);
  if (id) acc.toolUses.set(id, { name, path });
  const key = name.toLowerCase() === 'skill' || name.toLowerCase() === 'slashcommand' ? 'skills' : 'other';
  addChars(acc, key, textLength(block.input));
}

function observeToolResult(acc: AttributionAccumulator, block: Record<string, unknown>): void {
  const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
  const tracked = id ? acc.toolUses.get(id) : undefined;
  const name = tracked?.name ?? String(block.name ?? '');
  const path = tracked?.path ?? pathFromUnknown(block);
  addChars(acc, classifyTool(name, path), textLength(block.content ?? block));
}

function observeContent(acc: AttributionAccumulator, content: unknown): void {
  if (typeof content === 'string') {
    addChars(acc, classifyPlainText(content), content.length);
    return;
  }
  const blocks = contentBlocks(content);
  if (blocks.length === 0) {
    addChars(acc, 'other', textLength(content));
    return;
  }
  for (const block of blocks) {
    const type = String(block.type ?? '');
    if (type === 'tool_use') {
      observeToolUse(acc, block);
      continue;
    }
    if (type === 'tool_result') {
      observeToolResult(acc, block);
      continue;
    }
    const path = pathFromUnknown(block) ?? pathFromUnknown(block.source);
    const fromPath = classifyPath(path);
    if (fromPath) {
      addChars(acc, fromPath, textLength(block));
      continue;
    }
    if (type === 'text' && typeof block.text === 'string') {
      addChars(acc, classifyPlainText(block.text), block.text.length);
      continue;
    }
    addChars(acc, 'other', textLength(block));
  }
}

function siblingToolResult(event: Record<string, unknown>): unknown {
  return event.toolUseResult ?? event.tool_use_result ?? event.tool_result;
}

/** Classify parent-timeline JSONL events into character buckets (after last compact). */
export function observeAttributionEvent(
  acc: AttributionAccumulator,
  event: Record<string, unknown>,
): void {
  if (parentToolUseId(event)) return;
  if (isCompactEvent(event)) {
    resetAttributionAccumulator(acc);
    return;
  }

  const type = String(event.type ?? '');
  if (type === 'stream_event' || type === 'progress' || type === 'result') return;

  if (type === 'system') {
    const subtype = String(event.subtype ?? '');
    if (subtype === 'init') return;
    observeContent(acc, event.content ?? event.message);
    return;
  }

  const message = asRecord(event.message);
  observeContent(acc, message?.content ?? event.content);
  const extra = siblingToolResult(event);
  if (extra != null) addChars(acc, 'tool_results', textLength(extra));
}
