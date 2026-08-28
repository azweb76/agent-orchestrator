import type { KeyboardEvent } from 'react';
import type { SlashCommand } from '@agent-orchestrator/shared';
import type { MentionMenuOption } from './MentionMenu';

interface UseComposerKeyboardOptions {
  showSlashMenu: boolean;
  showMentionMenu: boolean;
  slashMatch: SlashCommand[];
  mentionOptions: MentionMenuOption[];
  highlight: number;
  mentionHighlight: number;
  isStreaming: boolean;
  setHighlight: (value: number | ((prev: number) => number)) => void;
  setMentionHighlight: (value: number | ((prev: number) => number)) => void;
  setSlashDismissed: (value: boolean) => void;
  setMentionDismissed: (value: boolean) => void;
  applySlashSelection: (item: SlashCommand) => void;
  applyMentionSelection: (option: MentionMenuOption) => void;
  submit: (force: boolean) => void;
}

export function createComposerKeyDownHandler({
  showSlashMenu,
  showMentionMenu,
  slashMatch,
  mentionOptions,
  highlight,
  mentionHighlight,
  isStreaming,
  setHighlight,
  setMentionHighlight,
  setSlashDismissed,
  setMentionDismissed,
  applySlashSelection,
  applyMentionSelection,
  submit,
}: UseComposerKeyboardOptions) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((prev) => Math.min(prev + 1, slashMatch.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        const selected = slashMatch[highlight];
        if (selected) {
          e.preventDefault();
          applySlashSelection(selected);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }
    if (showMentionMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHighlight((prev) => Math.min(prev + 1, mentionOptions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHighlight((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        const selected = mentionOptions[mentionHighlight];
        if (selected) {
          e.preventDefault();
          applyMentionSelection(selected);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionDismissed(true);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(isStreaming);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(false);
    }
  };
}
