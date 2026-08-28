import { useCallback } from 'react';
import type { SlashCommand } from '@agent-orchestrator/shared';
import type { PendingImage } from './composerTypes';
import type { PendingMention } from './mentionComposer';
import { resolveSlashCommand } from './slashComposer';

interface UseComposerSubmitOptions {
  archived: boolean;
  draft: string;
  commands: SlashCommand[];
  images: PendingImage[];
  mentions: PendingMention[];
  buildOutgoingMessage: (text: string) => string;
  onDraftChange: (value: string) => void;
  onSend: (text: string, images: PendingImage[], mentions: PendingMention[], force: boolean) => void;
  onClear: () => void;
  onRewind: () => void;
  clearImages: () => void;
  clearMentions: () => void;
}

export function useComposerSubmit({
  archived,
  draft,
  commands,
  images,
  mentions,
  buildOutgoingMessage,
  onDraftChange,
  onSend,
  onClear,
  onRewind,
  clearImages,
  clearMentions,
}: UseComposerSubmitOptions) {
  const canSend =
    !archived && Boolean(draft.trim() || images.length > 0 || mentions.length > 0);

  const submit = useCallback(
    (force: boolean) => {
      const raw = draft.trim();
      const slash = resolveSlashCommand(commands, raw);

      if (slash?.kind === 'local' && slash.command === '/clear') {
        onDraftChange('');
        clearImages();
        clearMentions();
        onClear();
        return;
      }

      if (slash?.kind === 'local' && slash.command === '/rewind') {
        onDraftChange('');
        clearImages();
        clearMentions();
        onRewind();
        return;
      }

      let text = raw;
      if (slash?.kind === 'prompt' && slash.prompt && raw === slash.command) {
        text = slash.prompt;
      }

      const outgoing = buildOutgoingMessage(text);
      if ((!outgoing && images.length === 0 && mentions.length === 0) || archived) return;
      onSend(outgoing, images, mentions, force);
      onDraftChange('');
      clearImages();
      clearMentions();
    },
    [
      archived,
      buildOutgoingMessage,
      clearImages,
      clearMentions,
      commands,
      draft,
      images,
      mentions,
      onClear,
      onDraftChange,
      onRewind,
      onSend,
    ],
  );

  return { canSend, submit };
}
