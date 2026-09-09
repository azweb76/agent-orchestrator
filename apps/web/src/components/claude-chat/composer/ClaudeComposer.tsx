import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { AutocompleteMenu } from './AutocompleteMenu';
import { ComposerInput } from './ComposerInput';
import { ComposerPendingAttachments } from './ComposerPendingAttachments';
import { ComposerToolbar } from './ComposerToolbar';
import { SlashCommandMenu } from './SlashCommandMenu';
import { filterSlashCommands, resolveSlashCommand } from './slashFilter';
import type { AutocompleteOption, ClaudeComposerConfig, ComposerAttachment } from '../types';

async function fileToAttachment(file: File): Promise<ComposerAttachment> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    name: file.name,
    mimeType: file.type || 'image/png',
    previewUrl: URL.createObjectURL(file),
    dataBase64: btoa(binary),
  };
}

export function ClaudeComposer({
  config,
  streaming,
  leading,
  trailing,
}: {
  config: ClaudeComposerConfig;
  streaming: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pluginHighlight, setPluginHighlight] = useState(0);
  const [pluginDismissed, setPluginDismissed] = useState(false);
  const [localAttachments, setLocalAttachments] = useState<ComposerAttachment[]>([]);
  const attachments = config.attachments ?? localAttachments;
  const setAttachments = config.onAttachmentsChange ?? setLocalAttachments;
  const commands = config.slashCommands ?? [];
  const slashMatch = useMemo(() => filterSlashCommands(commands, config.draft), [commands, config.draft]);
  const showSlashMenu =
    !slashDismissed && slashMatch.length > 0 && config.draft.trim().startsWith('/') && !config.draft.includes('\n');

  const activePlugin = useMemo(() => {
    const lastToken = config.draft.split(/\s/).pop() ?? '';
    return (config.plugins ?? []).find((plugin) => lastToken.startsWith(plugin.trigger));
  }, [config.draft, config.plugins]);

  const pluginOptions = activePlugin?.options ?? [];
  const showPluginMenu = Boolean(activePlugin) && pluginOptions.length > 0 && !pluginDismissed;

  useEffect(() => {
    setHighlight(0);
    setPluginHighlight(0);
  }, [config.draft]);

  const applySlash = (item: (typeof slashMatch)[number]) => {
    setSlashDismissed(true);
    if (item.insert) {
      config.onDraftChange(item.insert);
      return;
    }
    if (item.kind === 'prompt' && item.prompt) {
      config.onDraftChange(item.prompt);
      return;
    }
    config.onDraftChange(`${item.command} `);
  };

  const applyPlugin = (option: AutocompleteOption) => {
    if (!activePlugin) return;
    setPluginDismissed(true);
    config.onDraftChange(activePlugin.onSelect(option, config.draft));
  };

  const canSend = !config.disabled && Boolean(config.draft.trim() || attachments.length > 0);

  const submit = (force: boolean) => {
    const raw = config.draft.trim();
    const slash = resolveSlashCommand(commands, raw);
    if (slash?.kind === 'local' && slash.command === '/clear') {
      config.onDraftChange('');
      config.onClear?.();
      return;
    }
    if (slash?.kind === 'local' && slash.command === '/rewind') {
      config.onDraftChange('');
      config.onRewind?.();
      return;
    }
    let text = raw;
    if (slash?.kind === 'prompt' && slash.prompt && raw === slash.command) text = slash.prompt;
    if ((!text && attachments.length === 0) || config.disabled) return;
    config.onSend({ text, attachments, force });
    config.onDraftChange('');
    setAttachments([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
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
          applySlash(selected);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }
    if (showPluginMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPluginHighlight((prev) => Math.min(prev + 1, pluginOptions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPluginHighlight((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        const selected = pluginOptions[pluginHighlight];
        if (selected) {
          e.preventDefault();
          applyPlugin(selected);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPluginDismissed(true);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(streaming);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(false);
    }
  };

  return (
    <Stack spacing={1}>
      {(config.queue?.length ?? 0) > 0 && (
        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            Queued — sends when this reply finishes
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {config.queue?.map((item, index) => (
              <Chip
                key={item.id}
                label={`${index + 1}. ${item.text.slice(0, 48) || item.extraLabel || '(attachment)'}${item.text.length > 48 ? '…' : ''}`}
                onDelete={config.onRemoveQueued ? () => config.onRemoveQueued?.(item.id) : undefined}
                size="small"
              />
            ))}
          </Stack>
        </Stack>
      )}

      {showSlashMenu ? (
        <SlashCommandMenu commands={slashMatch} highlight={highlight} onHighlight={setHighlight} onSelect={applySlash} />
      ) : null}
      {showPluginMenu && activePlugin ? (
        <AutocompleteMenu
          options={pluginOptions}
          highlight={pluginHighlight}
          onHighlight={setPluginHighlight}
          onSelect={applyPlugin}
          label={activePlugin.id}
        />
      ) : null}

      <ComposerPendingAttachments
        images={attachments}
        onRemoveImage={(id) => setAttachments(attachments.filter((item) => item.id !== id))}
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
          archived={Boolean(config.disabled)}
          draft={config.draft}
          onDraftChange={config.onDraftChange}
          placeholder={config.placeholder}
          onPaste={(files) => {
            void Promise.all(files.map(fileToAttachment)).then((pending) => {
              setAttachments([...attachments, ...pending].slice(0, 6));
            });
          }}
          onKeyDown={handleKeyDown}
          onDraftInput={() => {
            setSlashDismissed(false);
            setPluginDismissed(false);
          }}
        />
        <ComposerToolbar
          disabled={config.disabled}
          streaming={streaming}
          canSend={canSend}
          model={config.model}
          models={config.models}
          onModelChange={config.onModelChange}
          effort={config.effort}
          efforts={config.efforts}
          onEffortChange={config.onEffortChange}
          permissionMode={config.permissionMode}
          permissionModes={config.permissionModes}
          onPermissionModeChange={config.onPermissionModeChange}
          onStop={config.onStop}
          onInterrupt={config.onInterrupt ?? config.onStop}
          onAddFiles={(files) => {
            void Promise.all(Array.from(files).map(fileToAttachment)).then((pending) => {
              setAttachments([...attachments, ...pending].slice(0, 6));
            });
          }}
          onSubmit={submit}
          leading={leading}
          trailing={trailing}
        />
      </Box>
    </Stack>
  );
}
