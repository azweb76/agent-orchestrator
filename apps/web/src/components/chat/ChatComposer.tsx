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
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import BoltIcon from '@mui/icons-material/Bolt';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import CloseIcon from '@mui/icons-material/Close';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import {
  CLAUDE_MODELS,
  LOCAL_SLASH_COMMANDS,
  PERMISSION_MODES,
  PROMPT_SLASH_COMMANDS,
  SESSION_GRADE_LABELS,
  type PermissionMode,
  type SessionGrade,
  type SlashCommand,
} from '@agent-orchestrator/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ContextUsageButton } from './ContextUsageDialog';

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
}

interface ChatComposerProps {
  agentId: string;
  sessionId: string;
  archived: boolean;
  isStreaming: boolean;
  model: string;
  permissionMode: PermissionMode;
  queue: QueuedChatItem[];
  onModelChange: (model: string) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onSend: (text: string, images: PendingImage[], force: boolean) => void;
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

function resolveSlashCommand(commands: SlashCommand[], text: string): SlashCommand | undefined {
  const token = text.trim().split(/\s+/)[0]?.toLowerCase();
  if (!token?.startsWith('/')) return undefined;
  const exact = commands.find((item) => item.command.toLowerCase() === token);
  if (exact) return exact;
  return commands.find((item) => item.aliases?.some((alias) => alias.toLowerCase() === token));
}

function filterSlashCommands(commands: SlashCommand[], draft: string): SlashCommand[] {
  const token = draft.trim().split(/\s+/)[0] ?? '';
  if (!token.startsWith('/')) return [];
  const needle = token.toLowerCase();
  return commands
    .filter((item) => {
      if (item.command.toLowerCase().startsWith(needle)) return true;
      return item.aliases?.some((alias) => alias.toLowerCase().startsWith(needle)) ?? false;
    })
    .slice(0, 12);
}

const FALLBACK_COMMANDS: SlashCommand[] = [...LOCAL_SLASH_COMMANDS, ...PROMPT_SLASH_COMMANDS];

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
  permissionMode,
  queue,
  onModelChange,
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

  const slashQuery = useQuery({
    queryKey: ['slash-commands', agentId],
    queryFn: () => api.listSlashCommands(agentId),
    enabled: Boolean(agentId),
    staleTime: 60_000,
  });

  const commands = slashQuery.data ?? FALLBACK_COMMANDS;
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
    setImages((prev) => [...prev, ...pending].slice(0, 6));
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

  const canSend = !archived && Boolean(draft.trim() || images.length > 0);

  const submit = (force: boolean) => {
    const raw = draft.trim();
    const slash = resolveSlashCommand(commands, raw);

    if (slash?.kind === 'local' && slash.command === '/clear') {
      onDraftChange('');
      setImages([]);
      onClear();
      return;
    }

    if (slash?.kind === 'local' && slash.command === '/rewind') {
      onDraftChange('');
      setImages([]);
      onRewind();
      return;
    }

    let text = raw;
    if (slash?.kind === 'prompt' && slash.prompt && raw === slash.command) {
      text = slash.prompt;
    }

    if ((!text && images.length === 0) || archived) return;
    onSend(text, images, force);
    onDraftChange('');
    setImages([]);
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
                label={`${index + 1}. ${item.text.slice(0, 48) || '(image)'}${item.text.length > 48 ? '…' : ''}`}
                onDelete={() => onRemoveQueued(item.id)}
                size="small"
              />
            ))}
          </Stack>
        </Stack>
      )}

      {showSlashMenu && (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
            overflow: 'hidden',
            maxHeight: 260,
            overflowY: 'auto',
          }}
          role="listbox"
          aria-label="Slash commands"
        >
          {slashMatch.map((item, index) => (
            <Box
              key={`${item.command}-${item.source ?? 'app'}`}
              role="option"
              aria-selected={index === highlight}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                applySlashSelection(item);
              }}
              sx={{
                px: 1.5,
                py: 0.85,
                cursor: 'pointer',
              display: 'flex',
                alignItems: { xs: 'flex-start', sm: 'baseline' },
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                gap: { xs: 0.25, sm: 2 },
                bgcolor: index === highlight ? 'rgba(94,234,212,0.1)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(94,234,212,0.1)' },
              }}
            >
              <Typography
                variant="body2"
                sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, flexShrink: 0 }}
              >
                {item.command}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {item.description}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {images.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {images.map((image) => (
            <Box key={image.id} sx={{ position: 'relative' }}>
              <Box
                component="img"
                src={image.previewUrl}
                alt={image.name}
                sx={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
              <IconButton
                size="small"
                onClick={() => removeImage(image.id)}
                aria-label={`Remove ${image.name}`}
                sx={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}

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
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(false);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              submit(isStreaming);
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
          <Tooltip title="Attach image">
            <span>
              <IconButton
                size="small"
                disabled={archived}
                onClick={() => fileRef.current?.click()}
                aria-label="Attach image"
              >
                <ImageOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

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

          {sessionId ? (
            <ContextUsageButton agentId={agentId} sessionId={sessionId} isStreaming={isStreaming} />
          ) : null}

          <Box sx={{ flex: 1 }} />

          {onGrade ? (
            <Tooltip
              title={
                grade
                  ? `Graded ${grade.score}/5 · ${SESSION_GRADE_LABELS[grade.score]}`
                  : 'Analyze this session'
              }
            >
              <span>
                <IconButton
                  size="small"
                  color={grade ? 'secondary' : 'inherit'}
                  disabled={!canGrade}
                  onClick={onGrade}
                  aria-label="Analyze this session"
                >
                  {grade ? <InsightsIcon fontSize="small" /> : <InsightsOutlinedIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          ) : null}

          <Tooltip title="Clear chat history and reset session (/clear)">
            <span>
              <IconButton
                size="small"
                color="inherit"
                disabled={archived || isStreaming}
                onClick={onClear}
                aria-label="Clear chat"
              >
                <DeleteOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          {isStreaming ? (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', ml: 'auto' }}>
              <Tooltip title="Stop this reply">
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
              </Tooltip>
              <Tooltip title="Interrupt and send now">
                <span>
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
                </span>
              </Tooltip>
              <Tooltip title="Send after this reply finishes">
                <span>
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
                </span>
              </Tooltip>
            </Stack>
          ) : (
            <Tooltip title="Send (Enter)">
              <span>
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
              </span>
            </Tooltip>
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
