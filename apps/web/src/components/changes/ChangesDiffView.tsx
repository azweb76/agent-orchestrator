import { useEffect, useMemo, useState } from 'react';
import {
  Box,
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
import { DiffBlock } from '../pr/DiffBlock';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import {
  allDirPaths,
  buildFileTree,
  defaultExpandedDirs,
  filterDiffFiles,
} from '../../utils/fileTree';
import { parseUnifiedDiff } from '../../utils/parseUnifiedDiff';
import { ChangesFileTree } from './ChangesFileTree';
import { truncatePatch, MAX_DIFF_PREVIEW_LINES } from './diffPreview';

export interface ChangesDiffViewProps {
  patch: string;
}

/** File-tree + per-file diff viewer for an agent worktree patch. */
export function ChangesDiffView({ patch }: ChangesDiffViewProps) {
  const files = useMemo(() => parseUnifiedDiff(patch), [patch]);
  const [filter, setFilter] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState(false);

  const visibleFiles = useMemo(() => filterDiffFiles(files, filter), [files, filter]);
  const tree = useMemo(() => buildFileTree(visibleFiles), [visibleFiles]);
  const filtering = Boolean(filter.trim());

  useEffect(() => {
    const dirs = filtering || visibleFiles.length <= 12 ? allDirPaths(tree) : defaultExpandedDirs(tree);
    setExpanded(new Set(dirs));
    setSelectedPath((prev) => {
      if (prev && visibleFiles.some((file) => file.path === prev)) return prev;
      return visibleFiles[0]?.path ?? null;
    });
  }, [files, tree, visibleFiles, filtering]);

  const selected = visibleFiles.find((file) => file.path === selectedPath) ?? null;
  const preview = useMemo(
    () => (selected ? truncatePatch(selected.patch) : null),
    [selected],
  );
  const totalAdditions = visibleFiles.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = visibleFiles.reduce((sum, file) => sum + file.deletions, 0);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const copyPath = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (files.length === 0) {
    return (
      <EmptyState
        compact
        title="No file changes"
        description="The patch could not be split into files."
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
          {visibleFiles.length === files.length
            ? `${files.length} ${files.length === 1 ? 'file' : 'files'}`
            : `${visibleFiles.length} of ${files.length} files`}
          {' · '}
          <Box component="span" sx={{ color: 'success.main' }}>
            +{totalAdditions}
          </Box>{' '}
          <Box component="span" sx={{ color: 'error.main' }}>
            −{totalDeletions}
          </Box>
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
                  'aria-label': 'Filter changed files',
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
              <ChangesFileTree
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
          {selected && preview ? (
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
                  {selected.previousPath
                    ? `${selected.previousPath} → ${selected.path}`
                    : selected.path}
                </Typography>
                <ControlTooltip title={copied ? 'Copied' : 'Copy path'}>
                  <IconButton size="small" aria-label="Copy file path" onClick={() => void copyPath()}>
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </ControlTooltip>
                <Typography variant="caption" color="success.main">
                  +{selected.additions}
                </Typography>
                <Typography variant="caption" color="error.main">
                  −{selected.deletions}
                </Typography>
              </Stack>
              {preview.truncated ? (
                <Typography variant="caption" color="text.secondary">
                  Showing first {MAX_DIFF_PREVIEW_LINES} lines of {preview.totalLines}.
                </Typography>
              ) : null}
              <DiffBlock patch={preview.patch} />
            </Stack>
          ) : (
            <EmptyState
              compact
              title="Select a file"
              description="Choose a file from the tree to view its diff."
            />
          )}
        </Box>
      </Stack>
    </Stack>
  );
}
