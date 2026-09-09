import { useRef, type ReactNode } from 'react';
import { Box, Button, IconButton, MenuItem, Select, Stack } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import BoltIcon from '@mui/icons-material/Bolt';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { ControlTooltip } from '../../ui/ControlTooltip';
import type { EffortLevel, PermissionMode, SelectOption } from '../types';

const selectSx = {
  fontSize: 13,
  fontWeight: 600,
  color: 'text.secondary',
  '& .MuiSelect-select': { py: 0.5, pr: '28px !important' },
} as const;

export function ComposerToolbar({
  disabled,
  streaming,
  canSend,
  model,
  models,
  onModelChange,
  effort,
  efforts,
  onEffortChange,
  permissionMode,
  permissionModes,
  onPermissionModeChange,
  onStop,
  onInterrupt,
  onAddFiles,
  onSubmit,
  leading,
  trailing,
}: {
  disabled?: boolean;
  streaming: boolean;
  canSend: boolean;
  model?: string;
  models?: SelectOption[];
  onModelChange?: (model: string) => void;
  effort?: EffortLevel;
  efforts?: SelectOption[];
  onEffortChange?: (effort: EffortLevel) => void;
  permissionMode?: PermissionMode;
  permissionModes?: SelectOption[];
  onPermissionModeChange?: (mode: PermissionMode) => void;
  onStop: () => void;
  onInterrupt?: () => void;
  onAddFiles: (files: FileList | File[]) => void;
  onSubmit: (force: boolean) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Stack
      direction="row"
      spacing={0.5}
      useFlexGap
      sx={{ alignItems: 'center', flexWrap: 'wrap', pt: 0.25, rowGap: 0.5 }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onAddFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <ControlTooltip title="Attach image" disabled={disabled}>
        <IconButton
          size="small"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          aria-label="Attach image"
        >
          <ImageOutlinedIcon fontSize="small" />
        </IconButton>
      </ControlTooltip>
      {leading}

      {models && model != null && onModelChange ? (
        <Select
          variant="standard"
          disableUnderline
          value={model}
          disabled={disabled}
          onChange={(e) => onModelChange(e.target.value)}
          inputProps={{ 'aria-label': 'Model' }}
          sx={{ ...selectSx, minWidth: { xs: 88, sm: 108 }, ml: 0.25 }}
        >
          {models.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.label}
            </MenuItem>
          ))}
        </Select>
      ) : null}

      {efforts && effort != null && onEffortChange ? (
        <Select
          variant="standard"
          disableUnderline
          value={effort}
          disabled={disabled}
          onChange={(e) => onEffortChange(e.target.value as EffortLevel)}
          inputProps={{ 'aria-label': 'Effort' }}
          sx={{ ...selectSx, minWidth: { xs: 72, sm: 92 } }}
        >
          {efforts.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.label}
            </MenuItem>
          ))}
        </Select>
      ) : null}

      {permissionModes && permissionMode != null && onPermissionModeChange ? (
        <Select
          variant="standard"
          disableUnderline
          value={permissionMode}
          disabled={disabled}
          onChange={(e) => onPermissionModeChange(e.target.value as PermissionMode)}
          inputProps={{ 'aria-label': 'Permission mode' }}
          sx={{ ...selectSx, minWidth: { xs: 96, sm: 118 } }}
        >
          {permissionModes.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.label}
            </MenuItem>
          ))}
        </Select>
      ) : null}

      <Box sx={{ flex: 1 }} />
      {trailing}

      {streaming ? (
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
          {onInterrupt ? (
            <ControlTooltip title="Interrupt and send now" disabled={!canSend}>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={<BoltIcon />}
                disabled={!canSend}
                onClick={() => onSubmit(true)}
                sx={{ minWidth: 0 }}
              >
                Force
              </Button>
            </ControlTooltip>
          ) : null}
          <ControlTooltip title="Send after this reply finishes" disabled={!canSend}>
            <Button
              size="small"
              variant="contained"
              endIcon={<SendIcon />}
              disabled={!canSend}
              onClick={() => onSubmit(false)}
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
            onClick={() => onSubmit(false)}
            aria-label="Send"
            sx={{
              bgcolor: canSend ? 'primary.main' : 'action.disabledBackground',
              color: canSend ? 'ao.action.onAccent' : 'text.disabled',
              '&:hover': { bgcolor: 'primary.light' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
            }}
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </ControlTooltip>
      )}
    </Stack>
  );
}
