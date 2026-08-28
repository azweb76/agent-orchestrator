import fs from 'node:fs/promises';
import type { Message } from '@agent-orchestrator/shared';
import {
  asRecord,
  fingerprint,
  isToolResultOnly,
  makeMessage,
  textFromContent,
  timelineFromContent,
  usageTokensFromMessage,
} from './claude-session-parse-helpers.js';

export interface ParsedClaudeSessionFile {
  messages: Message[];
  usageTokens: number | null;
  costUsd: number | null;
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
