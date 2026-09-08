import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import { useQuery } from '@tanstack/react-query';
import type { WorktreeFileEntry } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { allDirPaths, buildFileTree, defaultExpandedDirs } from '../../utils/fileTree';
import { filterMentionFiles } from '../chat/mentionComposer';
import { ChangesFileTree } from './ChangesFileTree';
import { FileContentBlock } from './FileContentBlock';

/** A worktree holds thousands of files, so open only the top level by default. */
const DEFAULT_EXPAND_DEPTH = 1;

/** Browse every tracked and untracked file in an agent worktree. */
export function WorktreeFilesView({ agentId }: { agentId: string }) {
  const [filter, setFilter] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState(false);

  const filesQuery = useQuery({
    queryKey: ['mention-files', agentId],
    queryFn: () => api.listMentionFiles(agentId),
    enabled: Boolean(agentId),
    staleTime: 60_000,
  });

  const allPaths = useMemo(
    () => (filesQuery.data ?? []).map((entry) => entry.path),
    [filesQuery.data],
  );
  const visibleFiles = useMemo<WorktreeFileEntry[]>(
    () => filterMentionFiles(allPaths, filter, allPaths.length).map((path) => ({ path })),
    [allPaths, filter],
  );
  const tree = useMemo(() => buildFileTree(visibleFiles), [visibleFiles]);
  const filtering = Boolean(filter.trim());

  useEffect(() => {
    setExpanded(
      new Set(filtering ? allDirPaths(tree) : defaultExpandedDirs(tree, DEFAULT_EXPAND_DEPTH)),
    );
  }, [tree, filtering]);

  const fileQuery = useQuery({
    queryKey: ['worktree-file', agentId, selectedPath],
    queryFn: () => api.getWorktreeFile(agentId, selectedPath!),
    enabled: Boolean(agentId) && Boolean(selectedPath),
  });

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const copyPath = async () => {
    if (!selectedPath) return;
    try {
      await navigator.clipboard.writeText(selectedPath);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (filesQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (allPaths.length === 0) {
    return (
      <EmptyState
        compact
        title="No files"
        description={
          filesQuery.error
            ? (filesQuery.error as Error).message
            : 'The worktree has no tracked or untracked files.'
        }
      />
    );
  }

  return (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', flexShrink: 0 }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          {visibleFiles.length === allPaths.length
            ? `${allPaths.length} ${allPaths.length === 1 ? 'file' : 'files'}`
            : `${visibleFiles.length} of ${allPaths.length} files`}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <ControlTooltip title="Expand all folders">
            <IconButton
              size="small"
              aria-label="Expand all folders"
              onClick={() => setExpanded(new Set(allDirPaths(tree)))}
            >
              <UnfoldMoreIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
          <ControlTooltip title="Collapse all folders">
            <IconButton
              size="small"
              aria-label="Collapse all folders"
              onClick={() => setExpanded(new Set())}
            >
              <UnfoldLessIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
        </Stack>
      </Stack>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={0}
        sx={{
          flex: 1,
          minHeight: 0,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Stack
          spacing={0.75}
          sx={{
            width: { xs: '100%', md: 300 },
            flexShrink: 0,
            maxHeight: { xs: 260, md: 'none' },
            height: { md: '100%' },
            borderRight: { md: 1 },
            borderBottom: { xs: 1, md: 0 },
            borderColor: 'divider',
            bgcolor: 'ao.surface.inset',
            minHeight: 0,
          }}
        >
          <Box sx={{ px: 0.75, pt: 0.75, flexShrink: 0 }}>
            <TextField
              size="small"
              fullWidth
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter files…"
              slotProps={{
                input: {
                  'aria-label': 'Filter worktree files',
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
          {visibleFiles.length === 0 ? (
            <Box sx={{ px: 1, py: 2 }}>
              <EmptyState compact title="No matching files" description="Try a different filter." />
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <ChangesFileTree<WorktreeFileEntry>
                tree={tree}
                selectedPath={selectedPath}
                expanded={expanded}
                onToggleDir={toggleDir}
                onSelectFile={(file) => setSelectedPath(file.path)}
              />
            </Box>
          )}
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', p: 1.25 }}>
          {selectedPath ? (
            <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: 12.5,
                    overflowWrap: 'anywhere',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {selectedPath}
                </Typography>
                <ControlTooltip title={copied ? 'Copied' : 'Copy path'}>
                  <IconButton size="small" aria-label="Copy file path" onClick={() => void copyPath()}>
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </ControlTooltip>
              </Stack>
              {fileQuery.isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : fileQuery.error ? (
                <EmptyState
                  compact
                  title="Cannot show this file"
                  description={(fileQuery.error as Error).message}
                />
              ) : fileQuery.data?.binary ? (
                <EmptyState
                  compact
                  title="Binary file"
                  description="This file has no text preview."
                />
              ) : fileQuery.data ? (
                <>
                  {fileQuery.data.truncated ? (
                    <Typography variant="caption" color="text.secondary">
                      Showing the first 100 KB of this file.
                    </Typography>
                  ) : null}
                  <FileContentBlock content={fileQuery.data.content} />
                </>
              ) : null}
            </Stack>
          ) : (
            <EmptyState
              compact
              title="Select a file"
              description="Choose a file from the tree to view its contents."
            />
          )}
        </Box>
      </Stack>
    </Stack>
  );
}
