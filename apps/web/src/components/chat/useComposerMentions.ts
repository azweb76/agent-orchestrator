import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { MentionMenuOption } from './MentionMenu';
import {
  appendMentionTokens,
  createPendingMention,
  filterMentionFiles,
  getMentionQueryAtEnd,
  hasPendingMention,
  removeMentionQuery,
  type PendingMention,
} from './mentionComposer';

export function useComposerMentions(agentId: string, draft: string, onDraftChange: (value: string) => void) {
  const [mentions, setMentions] = useState<PendingMention[]>([]);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(0);

  const filesQuery = useQuery({
    queryKey: ['mention-files', agentId],
    queryFn: () => api.listMentionFiles(agentId),
    enabled: Boolean(agentId),
    staleTime: 60_000,
  });

  const mentionMatch = useMemo(() => getMentionQueryAtEnd(draft), [draft]);
  const mentionOptions = useMemo((): MentionMenuOption[] => {
    if (!mentionMatch) return [];
    const query = mentionMatch.query;
    const options: MentionMenuOption[] = [];
    if ('diff'.startsWith(query.toLowerCase())) {
      options.push({
        kind: 'diff',
        label: '@diff',
        description: 'Current worktree patch',
      });
    }
    const files = filesQuery.data?.map((item) => item.path) ?? [];
    for (const filePath of filterMentionFiles(files, query)) {
      options.push({
        kind: 'file',
        path: filePath,
        label: `@${filePath}`,
        description: 'Attach file contents on send',
      });
    }
    return options.slice(0, 12);
  }, [filesQuery.data, mentionMatch]);

  const showMentionMenu =
    !mentionDismissed &&
    Boolean(mentionMatch) &&
    mentionOptions.length > 0 &&
    !draft.trim().startsWith('/');

  useEffect(() => {
    setMentionHighlight(0);
  }, [draft, mentionOptions.length]);

  const clearMentions = () => setMentions([]);

  const removeMention = (id: string) => {
    setMentions((prev) => prev.filter((item) => item.id !== id));
  };

  const applyMentionSelection = (option: MentionMenuOption) => {
    if (!mentionMatch) return;
    const candidate = createPendingMention(
      option.kind === 'diff' ? { kind: 'diff' } : { kind: 'file', path: option.path },
    );
    if (!hasPendingMention(mentions, candidate)) {
      setMentions((prev) => [...prev, candidate]);
    }
    onDraftChange(removeMentionQuery(draft, mentionMatch));
    setMentionDismissed(true);
  };

  const buildOutgoingMessage = (text: string) => appendMentionTokens(text, mentions);

  return {
    mentions,
    mentionHighlight,
    mentionOptions,
    showMentionMenu,
    setMentionDismissed,
    setMentionHighlight,
    clearMentions,
    removeMention,
    applyMentionSelection,
    buildOutgoingMessage,
  };
}

export type { PendingMention };
