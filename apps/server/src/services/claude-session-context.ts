import fs from 'node:fs/promises';
import {
  addTokenUsage,
  emptyTokenUsage,
  isNestedSubagentEvent,
  type SessionContextTurn,
  type TokenUsageBreakdown,
} from '@agent-orchestrator/shared';
import {
  asRecord,
  contextTokensFromUsage,
  eventModel,
  eventTimestamp,
  fingerprint,
  isCompactEvent,
  parseTokenUsage,
  toolNamesFromContent,
} from './claude-session-parse-helpers.js';

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
      const resultContext = resultUsage ? contextTokensFromUsage(resultUsage) : 0;
      // Only seed history from result when nothing else reported occupancy. Output-only
      // result stubs (common after interrupt) must not wipe the current size to zero.
      if (resultUsage && resultContext > 0 && history.length === 0) {
        billed = resultUsage;
        history.push({
          turn: 1,
          createdAt: eventTimestamp(event),
          model: eventModel(event, null),
          usage: resultUsage,
          contextTokens: resultContext,
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
    const contextTokens = contextTokensFromUsage(usage);
    // Skip output-only usage rows so a stopped mid-turn stub cannot become "current".
    if (contextTokens <= 0) continue;

    const turnModel = eventModel(event, message);
    if (turnModel) model = turnModel;
    billed = addTokenUsage(billed, usage);
    history.push({
      turn: history.length + 1,
      createdAt: eventTimestamp(event),
      model: turnModel,
      usage,
      contextTokens,
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
