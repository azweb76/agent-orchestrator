import { existsSync, readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  addTokenUsage,
  contextTokensFromUsage,
  emptyTokenUsage,
  isNestedSubagentEvent,
  totalTokensFromUsage,
  type Message,
  type SessionContextTurn,
  type StreamPart,
  type TokenUsageBreakdown,
} from '@agent-orchestrator/shared';

/** Claude Code stores transcripts under `<configDir>/projects/<encoded-cwd>/<sessionId>.jsonl`. */
export function encodeClaudeProjectDir(cwd: string): string {
  return path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-');
}

export function claudeConfigDirs(configDir?: string): string[] {
  const override = configDir?.trim() || process.env.CLAUDE_CONFIG_DIR?.trim();
  if (override) return [override];
  return [path.join(os.homedir(), '.claude'), path.join(os.homedir(), '.config', 'claude')];
}

function projectDirNames(cwd: string): string[] {
  // Claude Code only honors CLAUDE_CODE_PROJECT_DIR_NAME when CLAUDE_CONFIG_DIR is set.
  const named = process.env.CLAUDE_CONFIG_DIR?.trim()
    ? process.env.CLAUDE_CODE_PROJECT_DIR_NAME?.trim()
    : undefined;
  const encoded = encodeClaudeProjectDir(cwd);
  const slashEncoded = path.resolve(cwd).replace(/[/\\:]+/g, '-');
  return [...new Set([named, encoded, slashEncoded].filter((item): item is string => Boolean(item)))];
}

function sessionFileCandidates(cwd: string, sessionId: string, configDir: string): string[] {
  const name = `${sessionId}.jsonl`;
  const files: string[] = [];
  for (const project of projectDirNames(cwd)) {
    files.push(path.join(configDir, 'projects', project, name));
    files.push(path.join(configDir, 'projects', project, 'sessions', name));
  }
  return files;
}

function findSessionJsonl(projectsDir: string, sessionId: string): string | null {
  const name = `${sessionId}.jsonl`;
  try {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(projectsDir, entry.name);
      const direct = path.join(projectPath, name);
      if (existsSync(direct)) return direct;
      const nested = path.join(projectPath, 'sessions', name);
      if (existsSync(nested)) return nested;
    }
  } catch {
    return null;
  }
  return null;
}

export interface ResolveClaudeSessionFileInput {
  cwd: string;
  sessionId?: string | null;
  runLogPath?: string | null;
  configDir?: string;
}

/**
 * Locate the Claude Code session JSONL for this chat, falling back to the
 * orchestrator run log when the transcript file is not on disk.
 */
export function resolveClaudeSessionFilePath(input: ResolveClaudeSessionFileInput): string | null {
  const sessionId = input.sessionId?.trim();
  if (sessionId) {
    for (const configDir of claudeConfigDirs(input.configDir)) {
      for (const candidate of sessionFileCandidates(input.cwd, sessionId, configDir)) {
        if (existsSync(candidate)) return candidate;
      }
      const found = findSessionJsonl(path.join(configDir, 'projects'), sessionId);
      if (found) return found;
    }
  }

  const runLog = input.runLogPath?.trim();
  if (runLog && existsSync(runLog)) return runLog;
  return null;
}

export interface ParsedClaudeSessionFile {
  messages: Message[];
  usageTokens: number | null;
  costUsd: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function contentBlocks(content: unknown): Record<string, unknown>[] {
  if (!Array.isArray(content)) return [];
  return content.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  const parts: string[] = [];
  for (const block of contentBlocks(content)) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      parts.push(block.text);
    }
  }
  return parts.join('\n').trim();
}

function isToolResultOnly(content: unknown): boolean {
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

function timelineFromContent(content: unknown): StreamPart[] {
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

function parseTokenUsage(value: unknown): TokenUsageBreakdown | null {
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

function usageTokensFromMessage(message: Record<string, unknown> | null): number {
  const usage = parseTokenUsage(message?.usage);
  return usage ? totalTokensFromUsage(usage) : 0;
}

function eventTimestamp(event: Record<string, unknown>): string | null {
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

function eventModel(
  event: Record<string, unknown>,
  message: Record<string, unknown> | null,
): string | null {
  if (typeof message?.model === 'string' && message.model.trim()) return message.model.trim();
  if (typeof event.model === 'string' && event.model.trim()) return event.model.trim();
  return null;
}

function isCompactEvent(event: Record<string, unknown>): boolean {
  const type = String(event.type ?? '').toLowerCase();
  const subtype = String(event.subtype ?? '').toLowerCase();
  return type.includes('compact') || subtype.includes('compact');
}

function toolNamesFromContent(content: unknown): string[] {
  const names: string[] = [];
  for (const block of contentBlocks(content)) {
    if (block.type !== 'tool_use') continue;
    const name = String(block.name ?? '').trim();
    if (name) names.push(name);
  }
  return names;
}

function fingerprint(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch {
    return '';
  }
}

function makeMessage(id: number, role: Message['role'], content: unknown): Message {
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

/** Extract chat turns, tools, and usage from a Claude JSONL / stream-json session file. */
export function parseClaudeSessionFile(contents: string): ParsedClaudeSessionFile {
  let messageSeq = 0;
  const messages: Message[] = [];
  let usageTokens = 0;
  let hasUsage = false;
  let costUsd = 0;
  let hasCost = false;
  let lastAssistantFp = '';

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    if (!event) continue;
    const type = String(event.type ?? '');
    if (type === 'stream_event' || type === 'progress' || type === 'system') continue;

    if (type === 'result') {
      const cost = event.total_cost_usd;
      if (typeof cost === 'number' && Number.isFinite(cost)) {
        costUsd += cost;
        hasCost = true;
      }
      continue;
    }

    const message = asRecord(event.message);
    const content = message?.content ?? event.content;

    if (type === 'user') {
      lastAssistantFp = '';
      if (isToolResultOnly(content)) continue;
      const text = textFromContent(content);
      if (!text) continue;
      messages.push(makeMessage(++messageSeq, 'user', content));
      continue;
    }

    if (type === 'assistant') {
      const fp = fingerprint(content);
      if (fp && fp === lastAssistantFp) continue;
      lastAssistantFp = fp;
      const timeline = timelineFromContent(content);
      if (!textFromContent(content) && !timeline.some((part) => part.type === 'tool')) continue;
      const tokens = usageTokensFromMessage(message);
      if (tokens > 0) {
        usageTokens += tokens;
        hasUsage = true;
      }
      messages.push(makeMessage(++messageSeq, 'assistant', content));
    }
  }

  return {
    messages,
    usageTokens: hasUsage ? usageTokens : null,
    costUsd: hasCost ? Number(costUsd.toFixed(4)) : null,
  };
}

export async function readClaudeSessionFile(filePath: string): Promise<ParsedClaudeSessionFile> {
  const contents = await fs.readFile(filePath, 'utf8');
  return parseClaudeSessionFile(contents);
}

export interface ParsedClaudeSessionContext {
  model: string | null;
  costUsd: number | null;
  billed: TokenUsageBreakdown;
  history: SessionContextTurn[];
}

/** Extract per-turn context occupancy from a Claude JSONL / stream-json session file. */
export function parseClaudeSessionContext(contents: string): ParsedClaudeSessionContext {
  const history: SessionContextTurn[] = [];
  let billed = emptyTokenUsage();
  let model: string | null = null;
  let costUsd = 0;
  let hasCost = false;
  let pendingCompact = false;
  let lastAssistantFp = '';

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    if (!event) continue;
    if (isNestedSubagentEvent(event)) continue;

    if (isCompactEvent(event)) {
      pendingCompact = true;
      continue;
    }

    const type = String(event.type ?? '');
    if (type === 'system' && typeof event.model === 'string' && event.model.trim()) {
      model = event.model.trim();
    }

    if (type === 'result') {
      const cost = event.total_cost_usd;
      if (typeof cost === 'number' && Number.isFinite(cost)) {
        costUsd += cost;
        hasCost = true;
      }
      const resultUsage = parseTokenUsage(event.usage);
      if (resultUsage && history.length === 0) {
        billed = resultUsage;
        history.push({
          turn: 1,
          createdAt: eventTimestamp(event),
          model: eventModel(event, null),
          usage: resultUsage,
          contextTokens: contextTokensFromUsage(resultUsage),
          compacted: pendingCompact,
          tools: [],
        });
        pendingCompact = false;
      }
      continue;
    }

    if (type !== 'assistant') continue;
    const message = asRecord(event.message);
    const content = message?.content ?? event.content;
    const fp = fingerprint(content);
    if (fp && fp === lastAssistantFp) continue;
    lastAssistantFp = fp;

    const usage = parseTokenUsage(message?.usage ?? event.usage);
    if (!usage) continue;

    const turnModel = eventModel(event, message);
    if (turnModel) model = turnModel;
    billed = addTokenUsage(billed, usage);
    history.push({
      turn: history.length + 1,
      createdAt: eventTimestamp(event),
      model: turnModel,
      usage,
      contextTokens: contextTokensFromUsage(usage),
      compacted: pendingCompact,
      tools: toolNamesFromContent(content),
    });
    pendingCompact = false;
  }

  return {
    model,
    costUsd: hasCost ? Number(costUsd.toFixed(4)) : null,
    billed,
    history,
  };
}

export async function readClaudeSessionContext(filePath: string): Promise<ParsedClaudeSessionContext> {
  const contents = await fs.readFile(filePath, 'utf8');
  return parseClaudeSessionContext(contents);
}
