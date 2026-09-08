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
import SearchIcon from '@mui/icons-material/Search';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { WorktreeDirEntry, WorktreeFileEntry } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { allDirPaths, buildFileTree } from '../../utils/fileTree';
import { filterMentionFiles } from '../chat/mentionComposer';
import { ChangesFileTree } from './ChangesFileTree';
import { WorktreeFileDetail } from './WorktreeFileDetail';
import { buildLazyDirTree } from './worktreeDirTree';

/** Browse every tracked and untracked file in an agent worktree. */
export function WorktreeFilesView({ agentId }: { agentId: string }) {
  const [filter, setFilter] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [filterExpanded, setFilterExpanded] = useState<Set<string>>(() => new Set());
  const filtering = filter.trim().length > 0;

  // The root plus each open folder; expanding one adds its listing to the tree.
  const dirPaths = useMemo(() => ['', ...expanded], [expanded]);
  const dirQueries = useQueries({
    queries: dirPaths.map((dirPath) => ({
      queryKey: ['worktree-dir', agentId, dirPath],
      queryFn: () => api.listWorktreeDir(agentId, dirPath),
      enabled: Boolean(agentId),
      staleTime: 60_000,
    })),
  });
  const rootQuery = dirQueries[0];

  // Only the loaded folders are in play, so rebuilding per render stays cheap.
  const loadedDirs = new Map<string, WorktreeDirEntry[]>();
  dirPaths.forEach((dirPath, index) => {
    const data = dirQueries[index]?.data;
    if (data) loadedDirs.set(dirPath, data);
  });
  const lazyTree = buildLazyDirTree(loadedDirs);

  // Filtering needs every path at once, so that listing loads only on demand.
  const filesQuery = useQuery({
    queryKey: ['mention-files', agentId],
    queryFn: () => api.listMentionFiles(agentId),
    enabled: Boolean(agentId) && filtering,
    staleTime: 60_000,
  });
  const allPaths = useMemo(
    () => (filesQuery.data ?? []).map((entry) => entry.path),
    [filesQuery.data],
  );
  const matches = useMemo<WorktreeFileEntry[]>(
    () =>
      filtering ? filterMentionFiles(allPaths, filter, allPaths.length).map((path) => ({ path })) : [],
    [allPaths, filter, filtering],
  );
  const filterTree = useMemo(() => buildFileTree(matches), [matches]);

  useEffect(() => {
    if (filtering) setFilterExpanded(new Set(allDirPaths(filterTree)));
  }, [filtering, filterTree]);

  const toggleDir = (path: string) => {
    const setter = filtering ? setFilterExpanded : setExpanded;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (rootQuery?.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (rootQuery?.error) {
    return (
      <EmptyState compact title="No files" description={(rootQuery.error as Error).message} />
    );
  }

  if (lazyTree.length === 0) {
    return (
      <EmptyState
        compact
        title="No files"
        description="The worktree has no tracked or untracked files."
      />
    );
  }

  const tree = filtering ? filterTree : lazyTree;
  const treeExpanded = filtering ? filterExpanded : expanded;

  return (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', flexShrink: 0 }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          {filtering
            ? `${matches.length} of ${allPaths.length} files`
            : 'Open a folder to load its contents'}
        </Typography>
        <ControlTooltip title="Collapse all folders">
          <IconButton
            size="small"
            aria-label="Collapse all folders"
            onClick={() => (filtering ? setFilterExpanded(new Set()) : setExpanded(new Set()))}
          >
            <UnfoldLessIcon fontSize="small" />
          </IconButton>
        </ControlTooltip>
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
          {filtering && filesQuery.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={22} />
            </Box>
          ) : tree.length === 0 ? (
            <Box sx={{ px: 1, py: 2 }}>
              <EmptyState compact title="No matching files" description="Try a different filter." />
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <ChangesFileTree<WorktreeFileEntry>
                tree={tree}
                selectedPath={selectedPath}
                expanded={treeExpanded}
                onToggleDir={toggleDir}
                onSelectFile={(file) => setSelectedPath(file.path)}
              />
            </Box>
          )}
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', p: 1.25 }}>
          {selectedPath ? (
            <WorktreeFileDetail agentId={agentId} path={selectedPath} />
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
