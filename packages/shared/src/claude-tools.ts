/**
 * Helpers for Claude Code `--allowedTools` lists and the shared tool catalog.
 */

export {
  CLAUDE_CODE_TOOLS,
  CLAUDE_TOOL_CATEGORY_LABELS,
  INTERACTIVE_CLAUDE_TOOLS,
  type ClaudeCodeTool,
  type ClaudeToolCategory,
} from './claude-tools-catalog.js';

import {
  CLAUDE_CODE_TOOLS,
  INTERACTIVE_CLAUDE_TOOLS,
} from './claude-tools-catalog.js';

const TOOL_BY_ID = new Map(CLAUDE_CODE_TOOLS.map((tool) => [tool.id, tool]));

/** Bare tool ids that may appear in `--allowedTools` (excludes interactive). */
export const SELECTABLE_CLAUDE_TOOL_IDS: readonly string[] = CLAUDE_CODE_TOOLS.filter(
  (tool) => !tool.interactive,
).map((tool) => tool.id);

export function getClaudeCodeTool(id: string) {
  return TOOL_BY_ID.get(id);
}

/** Split a comma-separated `--allowedTools` string into entries. */
export function parseAllowedToolsList(value: string | null | undefined): string[] {
  if (value == null || !value.trim()) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Join allowed-tool entries, deduping while preserving order. */
export function formatAllowedToolsList(tools: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tools) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.join(',');
}

/** Bare name (`Bash`) vs patterned (`Bash(git *)`). */
export function isBareAllowedToolEntry(entry: string): boolean {
  return !entry.includes('(');
}

/** Tool name from `Bash` or `Bash(git *)`. */
export function toolNameFromAllowedEntry(entry: string): string {
  const open = entry.indexOf('(');
  return open === -1 ? entry : entry.slice(0, open);
}

export function isInteractiveAllowedToolEntry(entry: string): boolean {
  const name = toolNameFromAllowedEntry(entry);
  return (INTERACTIVE_CLAUDE_TOOLS as readonly string[]).includes(name);
}

/** Known catalog tools first (catalog order), then unknown / custom entries. */
export function sortAllowedToolsList(tools: readonly string[]): string[] {
  const catalogIndex = new Map(SELECTABLE_CLAUDE_TOOL_IDS.map((id, i) => [id, i]));
  return [...tools].sort((a, b) => {
    const aBare = isBareAllowedToolEntry(a) ? a : null;
    const bBare = isBareAllowedToolEntry(b) ? b : null;
    const aIdx = aBare != null ? catalogIndex.get(aBare) : undefined;
    const bIdx = bBare != null ? catalogIndex.get(bBare) : undefined;
    if (aIdx != null && bIdx != null) return aIdx - bIdx;
    if (aIdx != null) return -1;
    if (bIdx != null) return 1;
    return a.localeCompare(b);
  });
}

export function toggleBareAllowedTool(
  current: string | null | undefined,
  toolId: string,
  enabled: boolean,
): string {
  const list = parseAllowedToolsList(current).filter(
    (entry) => !(isBareAllowedToolEntry(entry) && entry === toolId),
  );
  if (enabled) list.push(toolId);
  return formatAllowedToolsList(sortAllowedToolsList(list));
}

export function setAllSelectableAllowedTools(): string {
  return formatAllowedToolsList([...SELECTABLE_CLAUDE_TOOL_IDS]);
}

export function addCustomAllowedToolPattern(
  current: string | null | undefined,
  pattern: string,
): string {
  const trimmed = pattern.trim();
  if (!trimmed || isInteractiveAllowedToolEntry(trimmed)) {
    return formatAllowedToolsList(parseAllowedToolsList(current));
  }
  return formatAllowedToolsList(
    sortAllowedToolsList([...parseAllowedToolsList(current), trimmed]),
  );
}

export function removeAllowedToolEntry(
  current: string | null | undefined,
  entry: string,
): string {
  return formatAllowedToolsList(
    parseAllowedToolsList(current).filter((item) => item !== entry),
  );
}
