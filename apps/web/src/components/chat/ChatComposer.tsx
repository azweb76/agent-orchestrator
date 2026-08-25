import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
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
import CircularProgress from '@mui/material/CircularProgress';
import {
  CHAT_SLASH_COMMANDS,
  CLAUDE_MODELS,
  PERMISSION_MODES,
  type PermissionMode,
} from '@agent-orchestrator/shared';

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
  onRemoveQueued: (id: string) => void;
  draft: string;
  onDraftChange: (value: string) => void;
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

export function ChatComposer({
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
  onRemoveQueued,
  draft,
  onDraftChange,
}: ChatComposerProps) {
  const [images, setImages] = useState<PendingImage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const slashMatch = draft.trim().startsWith('/')
    ? CHAT_SLASH_COMMANDS.filter((item) => item.command.startsWith(draft.trim().split(/\s/)[0] ?? ''))
    : [];

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

  const submit = (force: boolean) => {
    let text = draft.trim();
    const slash = CHAT_SLASH_COMMANDS.find((item) => item.command === text);
    if (slash) text = slash.prompt;
    if ((!text && images.length === 0) || archived) return;
    onSend(text, images, force);
    onDraftChange('');
    setImages([]);
  };

  return (
    <Stack spacing={1.25}>
      {queue.length > 0 && (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">
            Queued ({queue.length})
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

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Model</InputLabel>
          <Select
            label="Model"
            value={model}
            disabled={archived}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {CLAUDE_MODELS.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Permissions</InputLabel>
          <Select
            label="Permissions"
            value={permissionMode}
            disabled={archived}
            onChange={(e) => onPermissionModeChange(e.target.value as PermissionMode)}
          >
            {PERMISSION_MODES.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Clear chat history and reset session">
          <span>
            <Button
              size="small"
              color="inherit"
              startIcon={<DeleteOutlinedIcon />}
              disabled={archived || isStreaming}
              onClick={onClear}
            >
              Clear
            </Button>
          </span>
        </Tooltip>
      </Stack>

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

      {slashMatch.length > 0 && draft.trim().length > 0 && draft.trim().length < 12 && (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {slashMatch.map((item) => (
            <Chip
              key={item.command}
              size="small"
              label={item.command}
              onClick={() => onDraftChange(item.prompt)}
              clickable
            />
          ))}
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
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
            <IconButton disabled={archived} onClick={() => fileRef.current?.click()}>
              <ImageOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>

        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={8}
          placeholder="Message Claude… (Enter send, Shift+Enter newline, / for shortcuts, paste images)"
          value={draft}
          disabled={archived}
          onChange={(e) => onDraftChange(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
            if (files.length > 0) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(false);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              submit(isStreaming);
            }
          }}
        />

        {isStreaming ? (
          <>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<StopIcon />}
              onClick={onStop}
              sx={{ alignSelf: 'flex-end', minWidth: 110 }}
            >
              Stop
            </Button>
            <Button
              variant="contained"
              color="secondary"
              endIcon={<BoltIcon />}
              disabled={archived || (!draft.trim() && images.length === 0)}
              onClick={() => submit(true)}
              sx={{ alignSelf: 'flex-end', minWidth: 130 }}
            >
              Force send
            </Button>
            <Button
              variant="contained"
              endIcon={<SendIcon />}
              disabled={archived || (!draft.trim() && images.length === 0)}
              onClick={() => submit(false)}
              sx={{ alignSelf: 'flex-end', minWidth: 110 }}
            >
              Queue
            </Button>
          </>
        ) : (
          <Button
            variant="contained"
            endIcon={<SendIcon />}
            disabled={archived || (!draft.trim() && images.length === 0)}
            onClick={() => submit(false)}
            sx={{ alignSelf: 'flex-end', minWidth: 120 }}
          >
            Send
          </Button>
        )}
      </Stack>

      {isStreaming && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">
            Agent running — Queue waits for the current reply; Force send interrupts it.
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
