import fs from 'node:fs/promises';
import {
  addTokenUsage,
  emptyTokenUsage,
  isNestedSubagentEvent,
  parentToolUseId,
  type SessionContextBranch,
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
  taskToolUseBlocks,
  toolNamesFromContent,
} from './claude-session-parse-helpers.js';

export interface ParsedClaudeSessionContext {
  model: string | null;
  costUsd: number | null;
  billed: TokenUsageBreakdown;
  history: SessionContextTurn[];
  branches: SessionContextBranch[];
}

interface TaskDraft {
  subagentType: string | null;
  description: string | null;
  parentTurn: number;
}

interface BranchAccumulator {
  history: SessionContextTurn[];
  lastFp: string;
  pendingCompact: boolean;
}

function accumulateBranchEvent(
  branchAccum: Map<string, BranchAccumulator>,
  nestedId: string,
  event: Record<string, unknown>,
): void {
  let accum = branchAccum.get(nestedId);
  if (!accum) {
    accum = { history: [], lastFp: '', pendingCompact: false };
    branchAccum.set(nestedId, accum);
  }

  if (isCompactEvent(event)) {
    accum.pendingCompact = true;
    return;
  }

  if (String(event.type ?? '') !== 'assistant') return;
  const message = asRecord(event.message);
  const content = message?.content ?? event.content;
  const fp = fingerprint(content);
  if (fp && fp === accum.lastFp) return;
  accum.lastFp = fp;

  const usage = parseTokenUsage(message?.usage ?? event.usage);
  if (!usage) return;
  const contextTokens = contextTokensFromUsage(usage);
  // Skip output-only usage rows so a stopped mid-turn stub cannot become "current".
  if (contextTokens <= 0) return;

  accum.history.push({
    turn: accum.history.length + 1,
    createdAt: eventTimestamp(event),
    model: eventModel(event, message),
    usage,
    contextTokens,
    compacted: accum.pendingCompact,
    tools: toolNamesFromContent(content),
  });
  accum.pendingCompact = false;
}

/** Extract per-turn context occupancy from a Claude JSONL / stream-json session file. */
export function parseClaudeSessionContext(contents: string): ParsedClaudeSessionContext {
  const history: SessionContextTurn[] = [];
  const taskDrafts = new Map<string, TaskDraft>();
  const branchAccum = new Map<string, BranchAccumulator>();
  let billed = emptyTokenUsage();
  let model: string | null = null;
  let costUsd = 0;
  let hasCost = false;
  let pendingCompact = false;
  let lastAssistantFp = '';
  let parentSessionId: string | null = null;

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

    const nestedId = parentToolUseId(event);
    if (nestedId) {
      accumulateBranchEvent(branchAccum, nestedId, event);
      continue;
    }
    // No attributable tool_use id (session_id fallback) — drop, as today.
    if (isNestedSubagentEvent(event, parentSessionId)) continue;
    if (!parentSessionId && typeof event.session_id === 'string' && event.session_id.trim()) {
      parentSessionId = event.session_id.trim();
    }

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

    for (const task of taskToolUseBlocks(content)) {
      if (taskDrafts.has(task.id)) continue;
      taskDrafts.set(task.id, {
        subagentType: task.subagentType,
        description: task.description,
        parentTurn: history.length + 1,
      });
    }

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

  const branches: SessionContextBranch[] = [];
  for (const [id, draft] of taskDrafts) {
    branches.push({
      id,
      parentTurn: draft.parentTurn,
      subagentType: draft.subagentType,
      description: draft.description,
      history: branchAccum.get(id)?.history ?? [],
    });
    branchAccum.delete(id);
  }
  // Orphan parent_tool_use_id with no matching Task block (malformed/truncated file).
  for (const [id, accum] of branchAccum) {
    branches.push({
      id,
      parentTurn: -1,
      subagentType: null,
      description: null,
      history: accum.history,
    });
  }

  return {
    model,
    costUsd: hasCost ? Number(costUsd.toFixed(4)) : null,
    billed,
    history,
    branches,
  };
}

export async function readClaudeSessionContext(filePath: string): Promise<ParsedClaudeSessionContext> {
  const contents = await fs.readFile(filePath, 'utf8');
  return parseClaudeSessionContext(contents);
}
