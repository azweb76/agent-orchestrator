import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import type { AgentTask, ChatSession, ChatSessionTemplate } from '@agent-orchestrator/shared';
import { CHAT_TITLE_MAX_LENGTH, LISTED_CHAT_SESSION_TEMPLATES } from '@agent-orchestrator/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';

interface ChatSessionBarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  disabled?: boolean;
  creating?: boolean;
  onSelect: (sessionId: string) => void;
  onCreate: (template: ChatSessionTemplate) => void;
  onCreateTask?: (task: AgentTask) => void;
  onDelete?: (session: ChatSession) => void;
  onRename?: (session: ChatSession, title: string) => void;
}

function templateIcon(id: string) {
  if (id === 'review') return <RateReviewOutlinedIcon fontSize="small" />;
  if (id === 'address-review') return <ReplyOutlinedIcon fontSize="small" />;
  if (id === 'fix-ci') return <BugReportOutlinedIcon fontSize="small" />;
  if (id === 'create-draft-pr') return <MergeTypeIcon fontSize="small" />;
  return <ChatOutlinedIcon fontSize="small" />;
}

export function ChatSessionBar({
  sessions,
  activeSessionId,
  disabled,
  creating,
  onSelect,
  onCreate,
  onCreateTask,
  onDelete,
  onRename,
}: ChatSessionBarProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [sessionMenu, setSessionMenu] = useState<{
    el: HTMLElement;
    session: ChatSession;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const skipBlurRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canDelete = Boolean(onDelete) && !disabled;
  const canRename = Boolean(onRename) && !disabled;
  const activeSession = sessions.find((item) => item.id === activeSessionId) ?? null;
  const listedTasksQuery = useQuery({
    queryKey: ['agent-tasks'],
    queryFn: api.listAgentTasks,
    select: (tasks) => tasks.filter((item) => item.listed),
    enabled: Boolean(onCreateTask),
  });
  const listedTasks = listedTasksQuery.data ?? [];

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  const beginRename = (session: ChatSession) => {
    if (!canRename) return;
    skipBlurRef.current = false;
    setSessionMenu(null);
    setEditingId(session.id);
    setDraft(session.title);
  };

  const cancelRename = () => {
    skipBlurRef.current = true;
    setEditingId(null);
  };

  const commitRename = (session: ChatSession) => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    const next = draft.trim();
    setEditingId(null);
    if (!next || next === session.title) return;
    onRename?.(session, next.slice(0, CHAT_TITLE_MAX_LENGTH));
  };

  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{
        alignItems: 'center',
        px: { xs: 1.25, sm: 2 },
        py: 0.75,
        borderBottom: 1,
        borderColor: 'divider',
        minHeight: 44,
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          overflowX: 'auto',
          minWidth: 0,
          flex: 1,
          py: 0.25,
          scrollbarWidth: 'thin',
        }}
      >
        {sessions.map((session) => {
          const selected = session.id === activeSessionId;
          const running = session.status === 'running';
          const waiting = session.status === 'queued';
          const editing = editingId === session.id;
          const chipTooltip = waiting
            ? 'Waiting — another session is using this worktree'
            : canRename
              ? 'Double-click to rename'
              : undefined;
          const chip = (
            <Chip
              size="small"
              label={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  {running ? (
                    <Box
                      sx={(theme) => ({
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: 'secondary.main',
                        boxShadow: `0 0 0 3px ${theme.palette.ao.accent.secondaryRing}`,
                      })}
                    />
                  ) : waiting ? (
                    <ScheduleOutlinedIcon
                      sx={{ fontSize: 14, color: selected ? 'inherit' : 'warning.main' }}
                    />
                  ) : null}
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
                            commitRename(session);
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelRename();
                          }
                        }}
                        onBlur={() => commitRename(session)}
                        slotProps={{
                          htmlInput: {
                            maxLength: CHAT_TITLE_MAX_LENGTH,
                            'aria-label': 'Session name',
                          },
                        }}
                        sx={{
                          width: { xs: 132, sm: 168 },
                          '& .MuiInputBase-root': { height: 22 },
                          '& .MuiInputBase-input': {
                            py: 0,
                            px: 0.5,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          },
                        }}
                      />
                    </ControlTooltip>
                  ) : (
                    <Typography component="span" variant="caption" sx={{ fontWeight: 600 }}>
                      {session.title}
                      {waiting ? ' · Waiting' : ''}
                    </Typography>
                  )}
                  {!editing && session.grade ? (
                    <Typography component="span" variant="caption" sx={{ opacity: selected ? 0.9 : 0.7 }}>
                      {session.grade.score}★
                    </Typography>
                  ) : null}
                </Stack>
              }
              variant={selected ? 'filled' : 'outlined'}
              color={selected ? 'primary' : 'default'}
              onClick={() => {
                if (editing) return;
                onSelect(session.id);
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                beginRename(session);
              }}
              onContextMenu={(event) => {
                if (!canRename && !canDelete) return;
                event.preventDefault();
                setSessionMenu({ el: event.currentTarget, session });
              }}
              onDelete={canDelete && !editing ? () => onDelete?.(session) : undefined}
              deleteIcon={
                <CloseIcon fontSize="small" aria-label={`Delete ${session.title} session`} />
              }
              disabled={disabled}
              sx={{
                flexShrink: 0,
                '& .MuiChip-label': { px: 1 },
                '& .MuiChip-deleteIcon': {
                  fontSize: 16,
                  color: selected ? 'inherit' : 'text.secondary',
                  opacity: 0.72,
                  '&:hover': { opacity: 1, color: 'error.main' },
                },
              }}
            />
          );
          return (
            <Box key={session.id} component="span" sx={{ display: 'inline-flex' }}>
              {chipTooltip ? (
                <ControlTooltip title={chipTooltip}>
                  <span style={{ display: 'inline-flex' }}>{chip}</span>
                </ControlTooltip>
              ) : (
                chip
              )}
            </Box>
          );
        })}
      </Box>
      <ControlTooltip title="Rename session" disabled={!canRename || !activeSession}>
        <IconButton
          size="small"
          aria-label="Rename session"
          disabled={!canRename || !activeSession}
          onClick={() => {
            if (activeSession) beginRename(activeSession);
          }}
        >
          <DriveFileRenameOutlineIcon fontSize="small" />
        </IconButton>
      </ControlTooltip>
      <ControlTooltip title="New session" disabled={disabled || creating}>
        <IconButton
          size="small"
          aria-label="New session"
          disabled={disabled || creating}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          {creating ? <CircularProgress size={16} /> : <AddIcon fontSize="small" />}
        </IconButton>
      </ControlTooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {LISTED_CHAT_SESSION_TEMPLATES.map((template) => (
          <ControlTooltip key={template.id} title={template.description}>
            <MenuItem
              onClick={() => {
                setAnchor(null);
                onCreate(template);
              }}
            >
              <ListItemIcon>{templateIcon(template.id)}</ListItemIcon>
              <ListItemText
                primary={template.title}
                secondary={template.description}
                slotProps={{ secondary: { sx: { maxWidth: 260, whiteSpace: 'normal' } } }}
              />
            </MenuItem>
          </ControlTooltip>
        ))}
        {listedTasks.map((task) => (
          <ControlTooltip
            key={task.id}
            title={task.description || `${task.model} · ${task.effort} · ${task.permissionMode}`}
          >
            <MenuItem
              onClick={() => {
                setAnchor(null);
                onCreateTask?.(task);
              }}
            >
              <ListItemIcon>
                <TuneOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={task.title}
                secondary={task.description || task.name}
                slotProps={{ secondary: { sx: { maxWidth: 260, whiteSpace: 'normal' } } }}
              />
            </MenuItem>
          </ControlTooltip>
        ))}
      </Menu>
      <Menu
        anchorEl={sessionMenu?.el}
        open={Boolean(sessionMenu)}
        onClose={() => setSessionMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {canRename ? (
          <ControlTooltip title="Rename session">
            <MenuItem
              onClick={() => {
                if (sessionMenu) beginRename(sessionMenu.session);
              }}
            >
              <ListItemIcon>
                <DriveFileRenameOutlineIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Rename" />
            </MenuItem>
          </ControlTooltip>
        ) : null}
        {canDelete && sessionMenu ? (
          <ControlTooltip title="Delete session">
            <MenuItem
              onClick={() => {
                const target = sessionMenu.session;
                setSessionMenu(null);
                onDelete?.(target);
              }}
            >
              <ListItemIcon>
                <DeleteOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Delete" />
            </MenuItem>
          </ControlTooltip>
        ) : null}
      </Menu>
    </Stack>
  );
}
