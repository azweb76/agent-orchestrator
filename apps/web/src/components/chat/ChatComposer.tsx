import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import BoltIcon from '@mui/icons-material/Bolt';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import {
  CLAUDE_EFFORT_LEVELS,
  CLAUDE_MODELS,
  PERMISSION_MODES,
  SESSION_GRADE_LABELS,
  type EffortLevel,
  type PermissionMode,
  type SessionGrade,
  type SlashCommand,
} from '@agent-orchestrator/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { ContextUsageButton } from './ContextUsageDialog';
import { MentionMenu } from './MentionMenu';
import { SlashCommandMenu } from './SlashCommandMenu';
import { ComposerPendingAttachments } from './ComposerPendingAttachments';
import { useComposerMentions } from './useComposerMentions';
import { FALLBACK_SLASH_COMMANDS, filterSlashCommands, resolveSlashCommand } from './slashComposer';
import type { PendingMention } from './mentionComposer';

export interface PendingImage {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
  dataBase64: string;
}

export interface QueuedChatItem {
  id: string;
  text: string;
  images: PendingImage[];
  mentions: PendingMention[];
}

interface ChatComposerProps {
  agentId: string;
  sessionId: string;
  archived: boolean;
  isStreaming: boolean;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  queue: QueuedChatItem[];
  onModelChange: (model: string) => void;
  onEffortChange: (effort: EffortLevel) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onSend: (text: string, images: PendingImage[], mentions: PendingMention[], force: boolean) => void;
  onStop: () => void;
  onClear: () => void;
  onRewind: () => void;
  onRemoveQueued: (id: string) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  grade?: SessionGrade | null;
  canGrade?: boolean;
  onGrade?: () => void;
}

async function fileToPendingImage(file: File): Promise<PendingImage> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const dataBase64 = btoa(binary);
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    name: file.name,
    mimeType: file.type || 'image/png',
    previewUrl: URL.createObjectURL(file),
    dataBase64,
  };
}

const selectSx = {
  fontSize: 13,
  fontWeight: 600,
  color: 'text.secondary',
  '& .MuiSelect-select': { py: 0.5, pr: '28px !important' },
} as const;

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
  const [images, setImages] = useState<PendingImage[]>([]);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<PendingImage[]>([]);
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

  const revokeImages = (pending: PendingImage[]) => {
    for (const image of pending) URL.revokeObjectURL(image.previewUrl);
  };

  const clearImages = () => {
    setImages((prev) => {
      revokeImages(prev);
      return [];
    });
  };

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(
    () => () => {
      revokeImages(imagesRef.current);
    },
    [],
  );

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

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (list.length === 0) return;
    const pending = await Promise.all(list.map(fileToPendingImage));
    setImages((prev) => {
      const next = [...prev, ...pending];
      const kept = next.slice(0, 6);
      revokeImages(next.slice(6));
      return kept;
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  const applySlashSelection = (item: SlashCommand) => {
    setSlashDismissed(true);
    if (item.kind === 'prompt' && item.prompt) {
      onDraftChange(item.prompt);
      return;
    }
    onDraftChange(`${item.command} `);
  };

  const canSend =
    !archived && Boolean(draft.trim() || images.length > 0 || mentions.length > 0);

  const submit = (force: boolean) => {
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
  };

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
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'rgba(11,15,23,0.55)',
          px: 1.25,
          pt: 0.75,
          pb: 0.75,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          '&:focus-within': {
            borderColor: 'primary.main',
            boxShadow: '0 0 0 3px rgba(139,164,255,0.12)',
          },
        }}
      >
        <ControlTooltip title="Message Claude — Enter to send, Shift+Enter for newline">
          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={8}
            placeholder={archived ? 'This agent is archived' : 'Message Claude…'}
            value={draft}
            disabled={archived}
            variant="standard"
            slotProps={{
              input: { disableUnderline: true },
            }}
            onChange={(e) => {
            setSlashDismissed(false);
            setMentionDismissed(false);
            onDraftChange(e.target.value);
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
            if (files.length > 0) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          onKeyDown={(e) => {
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
            // Check the modifier combo first — a bare `Enter` guard would also
            // match Cmd/Ctrl+Enter and submit the same message twice.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit(isStreaming);
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(false);
            }
          }}
            sx={{
              '& .MuiInputBase-input': {
                py: 0.75,
                px: 0.5,
                lineHeight: 1.5,
              },
            }}
          />
        </ControlTooltip>

        <Stack
          direction="row"
          spacing={0.5}
          useFlexGap
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
            pt: 0.25,
            rowGap: 0.5,
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <ControlTooltip title="Attach image" disabled={archived}>
            <IconButton
              size="small"
              disabled={archived}
              onClick={() => fileRef.current?.click()}
              aria-label="Attach image"
            >
              <ImageOutlinedIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>

          <ControlTooltip title="Choose Claude model" disabled={archived}>
            <Select
              variant="standard"
              disableUnderline
              value={model}
              disabled={archived}
              onChange={(e) => onModelChange(e.target.value)}
              inputProps={{ 'aria-label': 'Model' }}
              sx={{ ...selectSx, minWidth: { xs: 88, sm: 108 }, ml: 0.25 }}
            >
              {CLAUDE_MODELS.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.label.replace('Claude ', '')}
                </MenuItem>
              ))}
            </Select>
          </ControlTooltip>

          <ControlTooltip title="Choose reasoning effort" disabled={archived}>
            <Select
              variant="standard"
              disableUnderline
              value={effort}
              disabled={archived}
              onChange={(e) => onEffortChange(e.target.value as EffortLevel)}
              inputProps={{ 'aria-label': 'Effort' }}
              sx={{ ...selectSx, minWidth: { xs: 72, sm: 92 } }}
            >
              {CLAUDE_EFFORT_LEVELS.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
          </ControlTooltip>

          <ControlTooltip title="Choose permission mode" disabled={archived}>
            <Select
              variant="standard"
              disableUnderline
              value={permissionMode}
              disabled={archived}
              onChange={(e) => onPermissionModeChange(e.target.value as PermissionMode)}
              inputProps={{ 'aria-label': 'Permission mode' }}
              sx={{ ...selectSx, minWidth: { xs: 96, sm: 118 } }}
            >
              {PERMISSION_MODES.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
          </ControlTooltip>

          {sessionId ? (
            <ContextUsageButton agentId={agentId} sessionId={sessionId} isStreaming={isStreaming} />
          ) : null}

          <Box sx={{ flex: 1 }} />

          {onGrade ? (
            <ControlTooltip
              title={
                grade
                  ? `Graded ${grade.score}/5 · ${SESSION_GRADE_LABELS[grade.score]}`
                  : 'Analyze this session'
              }
              disabled={!canGrade}
            >
              <IconButton
                size="small"
                color={grade ? 'secondary' : 'inherit'}
                disabled={!canGrade}
                onClick={onGrade}
                aria-label="Analyze this session"
              >
                {grade ? <InsightsIcon fontSize="small" /> : <InsightsOutlinedIcon fontSize="small" />}
              </IconButton>
            </ControlTooltip>
          ) : null}

          <ControlTooltip
            title="Clear chat history and reset session (/clear)"
            disabled={archived || isStreaming}
          >
            <IconButton
              size="small"
              color="inherit"
              disabled={archived || isStreaming}
              onClick={onClear}
              aria-label="Clear chat"
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>

          {isStreaming ? (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', ml: 'auto' }}>
              <ControlTooltip title="Stop this reply">
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<StopIcon />}
                  onClick={onStop}
                  sx={{ minWidth: 0 }}
                >
                  Stop
                </Button>
              </ControlTooltip>
              <ControlTooltip title="Interrupt and send now" disabled={!canSend}>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={<BoltIcon />}
                  disabled={!canSend}
                  onClick={() => submit(true)}
                  sx={{ minWidth: 0 }}
                >
                  Force
                </Button>
              </ControlTooltip>
              <ControlTooltip title="Send after this reply finishes" disabled={!canSend}>
                <Button
                  size="small"
                  variant="contained"
                  endIcon={<SendIcon />}
                  disabled={!canSend}
                  onClick={() => submit(false)}
                  sx={{ minWidth: 0 }}
                >
                  Queue
                </Button>
              </ControlTooltip>
            </Stack>
          ) : (
            <ControlTooltip title="Send (Enter)" disabled={!canSend}>
              <IconButton
                color="primary"
                disabled={!canSend}
                onClick={() => submit(false)}
                aria-label="Send"
                sx={{
                  bgcolor: canSend ? 'primary.main' : 'action.disabledBackground',
                  color: canSend ? '#0b0f17' : 'text.disabled',
                  '&:hover': { bgcolor: 'primary.light' },
                  '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
                }}
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </ControlTooltip>
          )}
        </Stack>
      </Box>

      {isStreaming && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
          Queue waits for this reply · Force interrupts it
        </Typography>
      )}
    </Stack>
  );
}
