import { useRef } from 'react';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Stack,
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
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { ContextUsageButton } from './ContextUsageDialog';

const selectSx = {
  fontSize: 13,
  fontWeight: 600,
  color: 'text.secondary',
  '& .MuiSelect-select': { py: 0.5, pr: '28px !important' },
} as const;

interface ComposerToolbarProps {
  agentId: string;
  sessionId: string;
  archived: boolean;
  isStreaming: boolean;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  canSend: boolean;
  canGrade?: boolean;
  grade?: SessionGrade | null;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: EffortLevel) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onStop: () => void;
  onClear: () => void;
  onGrade?: () => void;
  onAddFiles: (files: FileList | File[]) => void;
  onSubmit: (force: boolean) => void;
}

export function ComposerToolbar({
  agentId,
  sessionId,
  archived,
  isStreaming,
  model,
  effort,
  permissionMode,
  canSend,
  canGrade,
  grade,
  onModelChange,
  onEffortChange,
  onPermissionModeChange,
  onStop,
  onClear,
  onGrade,
  onAddFiles,
  onSubmit,
}: ComposerToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
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
          if (e.target.files) onAddFiles(e.target.files);
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
              onClick={() => onSubmit(true)}
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
