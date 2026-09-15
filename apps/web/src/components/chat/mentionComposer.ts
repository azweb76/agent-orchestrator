import type { ChatMention } from '@agent-orchestrator/shared';
import { formatChatMentionToken } from '@agent-orchestrator/shared';

export interface PendingMention {
  id: string;
  kind: ChatMention['kind'];
  path?: string;
}

export interface MentionQueryMatch {
  query: string;
  start: number;
}

export function createPendingMention(mention: ChatMention): PendingMention {
  return {
    id: `${mention.kind}:${mention.path ?? mention.kind}-${Date.now()}-${Math.random()}`,
    kind: mention.kind,
    path: mention.path,
  };
}

export function pendingMentionToChatMention(mention: PendingMention): ChatMention {
  if (mention.kind === 'diff') return { kind: 'diff' };
  if (mention.kind === 'goal') return { kind: 'goal' };
  return { kind: 'file', path: mention.path };
}

export function pendingMentionLabel(mention: PendingMention): string {
  return formatChatMentionToken(pendingMentionToChatMention(mention));
}

export function mentionKey(mention: Pick<PendingMention, 'kind' | 'path'>): string {
  if (mention.kind === 'diff') return 'diff';
  if (mention.kind === 'goal') return 'goal';
  return mention.path ?? '';
}

export function hasPendingMention(
  mentions: PendingMention[],
  candidate: Pick<PendingMention, 'kind' | 'path'>,
): boolean {
  const key = mentionKey(candidate);
  return mentions.some((item) => mentionKey(item) === key);
}

/** Active `@query` token at the end of the draft (after whitespace or start). */
export function getMentionQueryAtEnd(draft: string): MentionQueryMatch | null {
  const match = draft.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const start = draft.lastIndexOf('@');
  if (start < 0) return null;
  return { query: match[1] ?? '', start };
}

/** Swap the active `@query` for the mention's full token, leaving it in the draft. */
export function replaceMentionQuery(
  draft: string,
  match: MentionQueryMatch,
  token: string,
): string {
  const before = draft.slice(0, match.start);
  const after = draft.slice(match.start + match.query.length + 1);
  return `${before}${token} ${after.replace(/^\s+/, '')}`;
}

export function hasMentionToken(draft: string, token: string): boolean {
  return draft.split(/\s+/).includes(token);
}

/** Drop a mention token from the draft, used when its chip is removed. */
export function removeMentionToken(draft: string, token: string): string {
  return draft
    .split(/(\s+)/)
    .filter((part) => part !== token)
    .join('')
    .replace(/ {2,}/g, ' ');
}

export function filterMentionFiles(files: string[], query: string, limit = 12): string[] {
  const needle = query.trim().toLowerCase();
  const matches = files.filter((filePath) => {
    if (!needle) return true;
    const lower = filePath.toLowerCase();
    return lower.includes(needle) || lower.split('/').pop()?.startsWith(needle);
  });
  return matches.slice(0, limit);
}

/** Append only the tokens the draft does not already carry inline. */
export function appendMentionTokens(text: string, mentions: PendingMention[]): string {
  const trimmed = text.trim();
  const tokens = mentions
    .map((mention) => formatChatMentionToken(pendingMentionToChatMention(mention)))
    .filter((token) => !hasMentionToken(trimmed, token));
  if (tokens.length === 0) return trimmed;
  if (!trimmed) return tokens.join(' ');
  return `${trimmed} ${tokens.join(' ')}`;
}
