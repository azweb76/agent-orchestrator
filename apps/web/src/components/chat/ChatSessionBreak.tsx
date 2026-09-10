import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  CHAT_TITLE_MAX_LENGTH,
  CLAUDE_EFFORT_LEVELS,
  CLAUDE_MODELS,
  PERMISSION_MODES,
  chatSessionTemplateById,
  type ChatSession,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';
import { nextCommittedSessionTitle, shouldActivateSessionBreak } from './sessionBreakActions';

function modelLabel(model: string): string {
  const found = CLAUDE_MODELS.find((item) => item.id === model);
  return found ? found.label.replace('Claude ', '') : model;
}

function effortLabel(effort: ChatSession['effort']): string {
  return CLAUDE_EFFORT_LEVELS.find((item) => item.id === effort)?.label ?? effort;
}

function permissionLabel(mode: ChatSession['permissionMode']): string {
  return PERMISSION_MODES.find((item) => item.id === mode)?.label ?? mode;
}

export function ChatSessionBreak({
  session,
  active,
  disabled,
  onSelect,
  onRename,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  onRename?: (title: string) => void;
  onDelete?: () => void;
}) {
  const templateTitle = chatSessionTemplateById(session.template)?.title ?? session.template;
  const running = session.status === 'running';
  const waiting = session.status === 'queued';
  const canRename = Boolean(onRename) && !disabled;
  const canDelete = Boolean(onDelete) && !disabled;
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const skipBlurRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const beginRename = () => {
    if (!canRename) return;
    skipBlurRef.current = false;
    setMenuEl(null);
    setDraft(session.title);
    setEditing(true);
  };

  const cancelRename = () => {
    skipBlurRef.current = true;
    setEditing(false);
  };

  const commitRename = () => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    setEditing(false);
    const next = nextCommittedSessionTitle(draft, session.title);
    if (next) onRename?.(next);
  };

  const activate = () => {
    if (!shouldActivateSessionBreak(editing)) return;
    onSelect?.();
  };

  return (
    <Box
      data-session-break={session.id}
      aria-current={active ? 'true' : undefined}
      onClick={activate}
      onDoubleClick={(event) => {
        event.preventDefault();
        beginRename();
      }}
      onContextMenu={(event) => {
        if (!canRename && !canDelete) return;
        event.preventDefault();
        setMenuEl(event.currentTarget);
      }}
      sx={{
        pt: 1.25,
        pb: 1,
        px: 1,
        mb: 0.5,
        borderRadius: 1,
        borderLeft: 3,
        borderColor: active ? 'primary.main' : 'transparent',
        bgcolor: active ? 'action.selected' : 'transparent',
        cursor: editing ? 'text' : 'pointer',
        '&:hover': { bgcolor: active ? 'action.selected' : 'action.hover' },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
      >
        {editing ? (
          <ControlTooltip title="Edit session name">
            <TextField
              inputRef={inputRef}
              size="small"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={commitRename}
              slotProps={{
                htmlInput: {
                  maxLength: CHAT_TITLE_MAX_LENGTH,
                  'aria-label': 'Session name',
                },
              }}
              sx={{
                width: { xs: 168, sm: 220 },
                '& .MuiInputBase-root': { height: 28 },
                '& .MuiInputBase-input': { py: 0, px: 0.75, fontWeight: 700 },
              }}
            />
          </ControlTooltip>
        ) : (
          <Typography
            component="button"
            type="button"
            variant="subtitle2"
            aria-label={`Activate ${session.title} session`}
            onClick={(event) => {
              event.stopPropagation();
              activate();
            }}
            sx={{
              fontWeight: 700,
              minWidth: 0,
              border: 0,
              bgcolor: 'transparent',
              color: 'inherit',
              p: 0,
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              '&:focus-visible': {
                outline: (theme) => `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          >
            {session.title}
          </Typography>
        )}
        <Chip size="small" variant="outlined" label={templateTitle} />
        {running ? <Chip size="small" color="secondary" label="Running" /> : null}
        {waiting ? (
          <ControlTooltip title="Waiting — another session is using this worktree">
            <Chip size="small" label="Waiting" />
          </ControlTooltip>
        ) : null}
        {session.grade?.score != null ? (
          <Chip size="small" label={`${session.grade.score}★`} />
        ) : null}
        {canRename || canDelete ? (
          <ControlTooltip title="Session actions">
            <IconButton
              size="small"
              aria-label={`Actions for ${session.title}`}
              onClick={(event) => {
                event.stopPropagation();
                setMenuEl(event.currentTarget);
              }}
              sx={{ ml: 'auto' }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
        ) : null}
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}
      >
        {modelLabel(session.model)} · {effortLabel(session.effort)} · {permissionLabel(session.permissionMode)}
      </Typography>
      <Divider sx={{ mt: 1.25 }} />
      <Menu
        anchorEl={menuEl}
        open={Boolean(menuEl)}
        onClose={() => setMenuEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {canRename ? (
          <MenuItem
            onClick={(event) => {
              event.stopPropagation();
              beginRename();
            }}
          >
            <ListItemIcon>
              <DriveFileRenameOutlineIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Rename" />
          </MenuItem>
        ) : null}
        {canDelete ? (
          <MenuItem
            onClick={(event) => {
              event.stopPropagation();
              setMenuEl(null);
              onDelete?.();
            }}
          >
            <ListItemIcon>
              <DeleteOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Delete" />
          </MenuItem>
        ) : null}
      </Menu>
    </Box>
  );
}
