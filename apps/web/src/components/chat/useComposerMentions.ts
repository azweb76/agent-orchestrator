import { useEffect, useMemo, useState } from 'react';
import type { WorktreeFileEntry } from '@agent-orchestrator/shared';
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

export function useComposerMentions(
  files: WorktreeFileEntry[] | undefined,
  draft: string,
  onDraftChange: (value: string) => void,
  options?: { goalAvailable?: boolean },
) {
  const goalAvailable = Boolean(options?.goalAvailable);
  const [mentions, setMentions] = useState<PendingMention[]>([]);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(0);

  const mentionMatch = useMemo(() => getMentionQueryAtEnd(draft), [draft]);
  const mentionOptions = useMemo((): MentionMenuOption[] => {
    if (!mentionMatch) return [];
    const query = mentionMatch.query;
    const menu: MentionMenuOption[] = [];
    if ('diff'.startsWith(query.toLowerCase())) {
      menu.push({
        kind: 'diff',
        label: '@diff',
        description: 'Current worktree patch',
      });
    }
    if (goalAvailable && 'goal'.startsWith(query.toLowerCase())) {
      menu.push({
        kind: 'goal',
        label: '@goal',
        description: 'Attach the goal file path for the Read tool',
      });
    }
    const filePaths = files?.map((item) => item.path) ?? [];
    for (const filePath of filterMentionFiles(filePaths, query)) {
      menu.push({
        kind: 'file',
        path: filePath,
        label: `@${filePath}`,
        description: 'Attach file contents on send',
      });
    }
    return menu.slice(0, 12);
  }, [files, goalAvailable, mentionMatch]);

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
      option.kind === 'diff'
        ? { kind: 'diff' }
        : option.kind === 'goal'
          ? { kind: 'goal' }
          : { kind: 'file', path: option.path },
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
