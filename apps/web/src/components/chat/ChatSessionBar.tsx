import { useState } from 'react';
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import type { ChatSession, ChatSessionTemplate } from '@agent-orchestrator/shared';
import { LISTED_CHAT_SESSION_TEMPLATES } from '@agent-orchestrator/shared';

interface ChatSessionBarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  disabled?: boolean;
  creating?: boolean;
  onSelect: (sessionId: string) => void;
  onCreate: (template: ChatSessionTemplate) => void;
}

function templateIcon(id: string) {
  if (id === 'review') return <RateReviewOutlinedIcon fontSize="small" />;
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
}: ChatSessionBarProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

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
          return (
            <Chip
              key={session.id}
              size="small"
              label={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  {running ? (
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: 'secondary.main',
                        boxShadow: '0 0 0 3px rgba(94,234,212,0.25)',
                      }}
                    />
                  ) : null}
                  <Typography component="span" variant="caption" sx={{ fontWeight: 600 }}>
                    {session.title}
                  </Typography>
                </Stack>
              }
              variant={selected ? 'filled' : 'outlined'}
              color={selected ? 'primary' : 'default'}
              onClick={() => onSelect(session.id)}
              disabled={disabled}
              sx={{
                flexShrink: 0,
                '& .MuiChip-label': { px: 1 },
              }}
            />
          );
        })}
      </Box>
      <Tooltip title="New session">
        <span>
          <IconButton
            size="small"
            aria-label="New session"
            disabled={disabled || creating}
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            {creating ? <CircularProgress size={16} /> : <AddIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {LISTED_CHAT_SESSION_TEMPLATES.map((template) => (
          <MenuItem
            key={template.id}
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
        ))}
      </Menu>
    </Stack>
  );
}

