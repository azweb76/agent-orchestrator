export type ChatMentionKind = 'file' | 'diff';

export interface ChatMention {
  kind: ChatMentionKind;
  /** Repo-relative path when kind is `file`. */
  path?: string;
}

export interface WorktreeFileEntry {
  path: string;
}

/** User-visible @ token inserted into chat messages. */
export function formatChatMentionToken(mention: ChatMention): string {
  if (mention.kind === 'diff') return '@diff';
  const filePath = mention.path?.trim();
  return filePath ? `@${filePath}` : '@file';
}

export function chatMentionLabel(mention: ChatMention): string {
  return formatChatMentionToken(mention);
}
