import { useEffect, useMemo, useState } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import type { SlashCommand } from '@agent-orchestrator/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ComposerInput } from './ComposerInput';
import { ComposerPendingAttachments } from './ComposerPendingAttachments';
import { ComposerToolbar } from './ComposerToolbar';
import type { ChatComposerProps } from './composerTypes';
import { MentionMenu } from './MentionMenu';
import { SlashCommandMenu } from './SlashCommandMenu';
import { useComposerImages } from './useComposerImages';
import { createComposerKeyDownHandler } from './useComposerKeyboard';
import { useComposerMentions } from './useComposerMentions';
import { useComposerSubmit } from './useComposerSubmit';
import { FALLBACK_SLASH_COMMANDS, filterSlashCommands } from './slashComposer';

export type { PendingImage, QueuedChatItem } from './composerTypes';

export function ChatComposer({
  agentId,
  sessionId,
  archived,
  isStreaming,
  model,
  effort,
  permissionMode,
  queue,
  onModelChange,
  onEffortChange,
  onPermissionModeChange,
  onSend,
  onStop,
  onClear,
  onRewind,
  onRemoveQueued,
  draft,
  onDraftChange,
  grade,
  canGrade,
  onGrade,
}: ChatComposerProps) {
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const { images, clearImages, addFiles, removeImage } = useComposerImages();
  const {
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
  } = useComposerMentions(agentId, draft, onDraftChange);

  const slashQuery = useQuery({
    queryKey: ['slash-commands', agentId],
    queryFn: () => api.listSlashCommands(agentId),
    enabled: Boolean(agentId),
    staleTime: 60_000,
  });

  const commands = slashQuery.data ?? FALLBACK_SLASH_COMMANDS;
  const slashMatch = useMemo(() => filterSlashCommands(commands, draft), [commands, draft]);
  const showSlashMenu =
    !slashDismissed &&
    slashMatch.length > 0 &&
    draft.trim().startsWith('/') &&
    !draft.includes('\n');

  useEffect(() => {
    setHighlight(0);
  }, [draft]);

  const applySlashSelection = (item: SlashCommand) => {
    setSlashDismissed(true);
    if (item.kind === 'prompt' && item.prompt) {
      onDraftChange(item.prompt);
      return;
    }
    onDraftChange(`${item.command} `);
  };

  const { canSend, submit } = useComposerSubmit({
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
  });

  const handleKeyDown = createComposerKeyDownHandler({
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
  });

  return (
    <Stack spacing={1}>
      {queue.length > 0 && (
        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            Queued — sends when this reply finishes
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {queue.map((item, index) => (
              <Chip
                key={item.id}
                label={`${index + 1}. ${item.text.slice(0, 48) || (item.mentions.length ? '(mention)' : '(image)')}${item.text.length > 48 ? '…' : ''}`}
                onDelete={() => onRemoveQueued(item.id)}
                size="small"
              />
            ))}
          </Stack>
        </Stack>
      )}

      {showSlashMenu && (
        <SlashCommandMenu
          commands={slashMatch}
          highlight={highlight}
          onHighlight={setHighlight}
          onSelect={applySlashSelection}
        />
      )}

      {showMentionMenu && (
        <MentionMenu
          options={mentionOptions}
          highlight={mentionHighlight}
          onHighlight={setMentionHighlight}
          onSelect={applyMentionSelection}
        />
      )}

      <ComposerPendingAttachments
        mentions={mentions}
        images={images}
        onRemoveMention={removeMention}
        onRemoveImage={removeImage}
      />

      <Box
        sx={(theme) => ({
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'ao.surface.overlay',
          px: 1.25,
          pt: 0.75,
          pb: 0.75,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          '&:focus-within': {
            borderColor: 'primary.main',
            boxShadow: `0 0 0 3px ${theme.palette.ao.accent.primaryTint}`,
          },
        })}
      >
        <ComposerInput
          archived={archived}
          draft={draft}
          onDraftChange={onDraftChange}
          onPaste={(files) => void addFiles(files)}
          onKeyDown={handleKeyDown}
          onDraftInput={() => {
            setSlashDismissed(false);
            setMentionDismissed(false);
          }}
        />

        <ComposerToolbar
          agentId={agentId}
          sessionId={sessionId}
          archived={archived}
          isStreaming={isStreaming}
          model={model}
          effort={effort}
          permissionMode={permissionMode}
          canSend={canSend}
          canGrade={canGrade}
          grade={grade}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
          onPermissionModeChange={onPermissionModeChange}
          onStop={onStop}
          onClear={onClear}
          onGrade={onGrade}
          onAddFiles={(files) => void addFiles(files)}
          onSubmit={submit}
        />
      </Box>

      {isStreaming && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
          Queue waits for this reply · Force interrupts it
        </Typography>
      )}
    </Stack>
  );
}
