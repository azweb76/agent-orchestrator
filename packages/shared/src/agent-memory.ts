/** Where a durable memory applies. */
export type AgentMemoryScope = 'global' | 'workspace' | 'agent';

/** Coarse memory category for ranking and display. */
export type AgentMemoryKind = 'preference' | 'lesson' | 'fact';

export type AgentMemoryStatus = 'active' | 'archived';

export interface AgentMemory {
  id: string;
  scope: AgentMemoryScope;
  /** Set when scope is workspace or agent. */
  workspaceId: string | null;
  /** Set when scope is agent. */
  agentId: string | null;
  kind: AgentMemoryKind;
  /** Stable upsert key within a scope (e.g. `pref.tests`). */
  key: string;
  content: string;
  source: 'user' | 'grade' | 'system';
  sourceSessionId: string | null;
  status: AgentMemoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentMemoryRequest {
  scope: AgentMemoryScope;
  workspaceId?: string | null;
  agentId?: string | null;
  kind?: AgentMemoryKind;
  key: string;
  content: string;
  sourceSessionId?: string | null;
}

export interface UpdateAgentMemoryRequest {
  kind?: AgentMemoryKind;
  key?: string;
  content?: string;
  status?: AgentMemoryStatus;
}

/** Soft cap for memory text appended to Claude `--append-system-prompt`. */
export const AGENT_MEMORY_PROMPT_MAX_CHARS = 2000;

const KIND_ORDER: Record<AgentMemoryKind, number> = {
  preference: 0,
  lesson: 1,
  fact: 2,
};

/** Rank memories for prompt injection (preferences first, then fresher). */
export function rankAgentMemories(memories: AgentMemory[]): AgentMemory[] {
  return [...memories].sort((a, b) => {
    const kindDelta = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kindDelta !== 0) return kindDelta;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/**
 * Format active memories into a short system-prompt block.
 * Truncates to `maxChars` without cutting mid-item when possible.
 */
export function formatMemoriesForSystemPrompt(
  memories: AgentMemory[],
  maxChars = AGENT_MEMORY_PROMPT_MAX_CHARS,
): string {
  const ranked = rankAgentMemories(memories.filter((item) => item.status === 'active'));
  if (ranked.length === 0) return '';

  const lines: string[] = ['## Orchestrator memory', 'Use these durable notes when relevant:'];
  let used = lines.join('\n').length;

  for (const item of ranked) {
    const line = `- [${item.kind}/${item.scope}] ${item.key}: ${item.content.trim()}`;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }

  return lines.length > 2 ? lines.join('\n') : '';
}

/** Merge a memory block onto an existing session/task system prompt. */
export function mergeSystemPromptWithMemories(
  base: string | null | undefined,
  memoryBlock: string,
): string | null {
  const trimmedBase = base?.trim() || '';
  const trimmedMemory = memoryBlock.trim();
  if (!trimmedBase && !trimmedMemory) return null;
  if (!trimmedMemory) return trimmedBase || null;
  if (!trimmedBase) return trimmedMemory;
  return `${trimmedBase}\n\n${trimmedMemory}`;
}
