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
    id: `${mention.kind}:${mention.path ?? 'diff'}-${Date.now()}-${Math.random()}`,
    kind: mention.kind,
    path: mention.path,
  };
}

export function pendingMentionToChatMention(mention: PendingMention): ChatMention {
  return mention.kind === 'diff' ? { kind: 'diff' } : { kind: 'file', path: mention.path };
}

export function mentionKey(mention: Pick<PendingMention, 'kind' | 'path'>): string {
  return mention.kind === 'diff' ? 'diff' : (mention.path ?? '');
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

export function removeMentionQuery(draft: string, match: MentionQueryMatch): string {
  const before = draft.slice(0, match.start).replace(/\s$/, '');
  const after = draft.slice(match.start + match.query.length + 1);
  return `${before}${after}`.replace(/^\s+/, '');
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

export function appendMentionTokens(text: string, mentions: PendingMention[]): string {
  if (mentions.length === 0) return text.trim();
  const tokens = mentions.map((mention) => formatChatMentionToken(pendingMentionToChatMention(mention)));
  const trimmed = text.trim();
  if (!trimmed) return tokens.join(' ');
  return `${trimmed} ${tokens.join(' ')}`;
}
