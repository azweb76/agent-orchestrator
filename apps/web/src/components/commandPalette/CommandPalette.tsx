import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Dialog,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import {
  buildPaletteCommands,
  filterPaletteCommands,
  isCommandPaletteShortcut,
  paletteShortcutLabel,
  type PaletteCommandAction,
} from './paletteCommands';

const MAX_RESULTS = 24;

/** Global Cmd/Ctrl+K listener. The palette owns no other shortcuts. */
export function useCommandPaletteShortcut(onShortcut: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isCommandPaletteShortcut(event)) return;
      event.preventDefault();
      onShortcut();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onShortcut]);
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  onNewAgent: (workspaceId: string, defaultBranch?: string) => void;
  onNewWorkspace: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onToggleSidebar,
  onNewAgent,
  onNewWorkspace,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    enabled: open,
  });
  const { data: sidebar } = useQuery({
    queryKey: ['sidebar'],
    queryFn: api.listSidebar,
    enabled: open,
  });
  const { data: inbox } = useQuery({
    queryKey: ['pulls-inbox'],
    queryFn: api.getPullRequestInbox,
    enabled: open && Boolean(status?.githubTokenConfigured),
  });

  const commands = useMemo(
    () => buildPaletteCommands(sidebar ?? [], inbox ?? null),
    [sidebar, inbox],
  );
  const filtered = useMemo(
    () => filterPaletteCommands(commands, query).slice(0, MAX_RESULTS),
    [commands, query],
  );

  const activeIndex = Math.min(highlight, Math.max(filtered.length - 1, 0));

  const runAction = (action: PaletteCommandAction) => {
    onClose();
    if (action.kind === 'navigate') navigate(action.to);
    else if (action.kind === 'toggle-sidebar') onToggleSidebar();
    else if (action.kind === 'new-agent') onNewAgent(action.workspaceId, action.defaultBranch);
    else onNewWorkspace();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-label="Command palette"
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      slotProps={{
        paper: {
          sx: {
            mt: { xs: 2, sm: 10 },
            bgcolor: 'rgba(18,24,38,0.98)',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
          },
        },
      }}
    >
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          fullWidth
          autoFocus
          variant="standard"
          placeholder="Jump to an agent, workspace, or PR — or run an action…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight(Math.min(activeIndex + 1, Math.max(filtered.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight(Math.max(activeIndex - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const command = filtered[activeIndex];
              if (command) runAction(command.action);
            }
          }}
          slotProps={{
            input: {
              disableUnderline: true,
              'aria-label': 'Search commands',
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: '"IBM Plex Mono", monospace', color: 'text.disabled' }}
                  >
                    {paletteShortcutLabel()}
                  </Typography>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>
          No matches. Try an agent, workspace, branch, or PR title.
        </Typography>
      ) : (
        <List dense disablePadding sx={{ maxHeight: 420, overflowY: 'auto', py: 0.5 }}>
          {filtered.map((command, index) => (
            <Box key={command.id}>
              {(index === 0 || filtered[index - 1]!.group !== command.group) && (
                <ListSubheader
                  disableSticky
                  sx={{
                    bgcolor: 'transparent',
                    lineHeight: 2,
                    fontFamily: '"IBM Plex Mono", monospace',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                  }}
                >
                  {command.group}
                </ListSubheader>
              )}
              <ListItemButton
                selected={index === activeIndex}
                onClick={() => runAction(command.action)}
                onMouseMove={() => setHighlight(index)}
                ref={
                  index === activeIndex
                    ? (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })
                    : undefined
                }
                sx={{ px: 2, py: 0.75 }}
              >
                <ListItemText
                  primary={
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {command.label}
                    </Typography>
                  }
                  secondary={
                    command.hint ? (
                      <Typography variant="caption" color="text.secondary" noWrap component="span">
                        {command.hint}
                      </Typography>
                    ) : null
                  }
                />
              </ListItemButton>
            </Box>
          ))}
        </List>
      )}
    </Dialog>
  );
}
