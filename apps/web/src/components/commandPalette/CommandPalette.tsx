import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InboxPullRequest, PullRequestChecks } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';
import { ControlTooltip } from '../ui/ControlTooltip';
import { buildFleetBulkCounts } from './fleetBulkActions';
import { useFleetBulkRunner } from './useFleetBulkRunner';
import {
  buildPaletteCommands,
  filterPaletteCommands,
  isCommandPaletteShortcut,
  paletteShortcutLabel,
  transcriptHitsToCommands,
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

function checksFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  pr: InboxPullRequest,
): PullRequestChecks | undefined {
  return queryClient.getQueryData<PullRequestChecks>([
    'pr',
    pr.owner,
    pr.repo,
    pr.number,
    'checks',
  ]);
}

export function CommandPalette({
  open,
  onClose,
  onToggleSidebar,
  onNewAgent,
  onNewWorkspace,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
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
  const { data: mergedAgents } = useQuery({
    queryKey: ['fleet-merged-agents'],
    queryFn: api.listMergedFleetAgents,
    enabled: open && Boolean(status?.githubTokenConfigured),
  });

  useEffect(() => {
    if (!open || !inbox) return;
    for (const pr of inbox.authored) {
      if (!pr.agentId) continue;
      void queryClient.prefetchQuery({
        queryKey: ['pr', pr.owner, pr.repo, pr.number, 'checks'],
        queryFn: () => api.getPullRequestChecks(pr.owner, pr.repo, pr.number),
        staleTime: 60_000,
      });
    }
  }, [open, inbox, queryClient]);

  const searchQuery = query.trim();
  const { data: transcriptHits } = useQuery({
    queryKey: ['session-search', searchQuery],
    queryFn: () => api.searchSessions(searchQuery, MAX_RESULTS),
    enabled: open && searchQuery.length > 0,
  });

  const bulkCounts = useMemo(
    () =>
      buildFleetBulkCounts({
        inbox,
        sidebar: sidebar ?? [],
        mergedAgents,
        checksForPr: (pr) => checksFromCache(queryClient, pr),
      }),
    [inbox, sidebar, mergedAgents, queryClient],
  );

  const bulkRunner = useFleetBulkRunner({
    inbox,
    sidebar: sidebar ?? [],
    mergedAgents,
    checksForPr: (pr) => checksFromCache(queryClient, pr),
    onAfterRun: onClose,
  });

  const commands = useMemo(() => {
    const base = buildPaletteCommands(sidebar ?? [], inbox ?? null, bulkCounts);
    if (!searchQuery) return base;
    const transcriptCommands = transcriptHitsToCommands(transcriptHits ?? []);
    return [...filterPaletteCommands(base, searchQuery), ...transcriptCommands];
  }, [sidebar, inbox, bulkCounts, searchQuery, transcriptHits]);

  const filtered = useMemo(() => {
    if (searchQuery) return commands.slice(0, MAX_RESULTS);
    return filterPaletteCommands(commands, query).slice(0, MAX_RESULTS);
  }, [commands, query, searchQuery]);

  const activeIndex = Math.min(highlight, Math.max(filtered.length - 1, 0));

  const runAction = (action: PaletteCommandAction) => {
    if (action.kind === 'bulk') {
      bulkRunner.requestAction(action.bulk);
      if (action.bulk !== 'archive-merged-all') onClose();
      return;
    }
    onClose();
    if (action.kind === 'navigate') navigate(action.to, action.state ? { state: action.state } : undefined);
    else if (action.kind === 'toggle-sidebar') onToggleSidebar();
    else if (action.kind === 'new-agent') onNewAgent(action.workspaceId, action.defaultBranch);
    else if (action.kind === 'open-session') {
      navigate(`/agents/${action.agentId}`, { state: { sessionId: action.sessionId } });
    } else onNewWorkspace();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        aria-label="Command palette"
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
        sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
        slotProps={{
          transition: { onEntered: () => inputRef.current?.focus() },
          paper: {
            sx: {
              mt: { xs: 2, sm: 10 },
              bgcolor: 'ao.surface.elevated',
              backgroundImage: 'none',
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        }}
      >
        <Box sx={{ px: 1.5, pt: 1.25, pb: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <ControlTooltip title="Jump to agent, workspace, PR, transcript, or run a fleet action">
            <TextField
              fullWidth
              autoFocus
              inputRef={inputRef}
              variant="standard"
              placeholder="Search agents, transcripts, or run a fleet action…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
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
          </ControlTooltip>
        </Box>

        {bulkRunner.error ? (
          <Alert severity="error" sx={{ mx: 2, mt: 1 }} onClose={bulkRunner.clearError}>
            {bulkRunner.error}
          </Alert>
        ) : null}

        {filtered.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>
            No matches. Try an agent, transcript snippet, workspace, branch, or PR title.
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

      <ConfirmDialog
        open={bulkRunner.pendingConfirm === 'archive-merged-all'}
        title="Archive merged agents?"
        description={`This archives ${bulkCounts.archiveMerged} agent${
          bulkCounts.archiveMerged === 1 ? '' : 's'
        } whose pull requests have merged. Worktrees are kept unless you delete them later.`}
        confirmLabel="Archive merged"
        confirmColor="warning"
        loading={bulkRunner.loading}
        onCancel={bulkRunner.cancelPending}
        onConfirm={bulkRunner.confirmPending}
      />
    </>
  );
}
