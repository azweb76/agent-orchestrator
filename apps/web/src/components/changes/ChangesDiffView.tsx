import { useEffect, useMemo, useState } from 'react';
import { Box, Collapse, Stack, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { Virtuoso } from 'react-virtuoso';
import { DiffBlock } from '../pr/DiffBlock';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import {
  buildFileTree,
  defaultExpandedDirs,
  type FileTreeDirNode,
  type FileTreeNode,
} from '../../utils/fileTree';
import { parseUnifiedDiff, type DiffFile, type DiffFileStatus } from '../../utils/parseUnifiedDiff';
import { truncatePatch, MAX_DIFF_PREVIEW_LINES } from './diffPreview';
import {
  FILE_TREE_VIRTUOSO_THRESHOLD,
  flattenVisibleFileTree,
  type FlatFileTreeRow,
} from './flattenFileTree';

const STATUS_COLOR: Record<DiffFileStatus, string> = {
  added: 'success.main',
  deleted: 'error.main',
  modified: 'warning.main',
  renamed: 'info.main',
};

const STATUS_LETTER: Record<DiffFileStatus, string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
  renamed: 'R',
};

function DirRow({
  node,
  depth,
  expanded,
  onToggleDir,
}: {
  node: FileTreeDirNode;
  depth: number;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onToggleDir(node.path)}
      aria-expanded={isOpen}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        pl: 0.5 + depth * 1.25,
        pr: 1,
        py: 0.35,
        border: 0,
        bgcolor: 'transparent',
        color: 'text.primary',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 1,
        '&:hover': { bgcolor: 'ao.surface.hover' },
      }}
    >
      {isOpen ? (
        <ExpandMoreIcon sx={{ fontSize: 16, opacity: 0.7 }} />
      ) : (
        <ChevronRightIcon sx={{ fontSize: 16, opacity: 0.7 }} />
      )}
      <FolderOutlinedIcon sx={{ fontSize: 15, color: 'secondary.main', opacity: 0.9 }} />
      <Typography variant="body2" noWrap sx={{ fontSize: 13, fontWeight: 500 }}>
        {node.name}
      </Typography>
    </Box>
  );
}

function FileRow({
  file,
  name,
  depth,
  selected,
  onSelect,
}: {
  file: DiffFile;
  name: string;
  depth: number;
  selected: boolean;
  onSelect: (file: DiffFile) => void;
}) {
  return (
    <ControlTooltip title={file.path}>
      <Box
        component="button"
        type="button"
        onClick={() => onSelect(file)}
        aria-current={selected ? 'true' : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          width: '100%',
          pl: 0.5 + depth * 1.25 + 2,
          pr: 1,
          py: 0.4,
          border: 0,
          borderLeft: '2px solid',
          borderColor: selected ? 'secondary.main' : 'transparent',
          bgcolor: selected ? 'ao.surface.selectedStrong' : 'transparent',
          color: selected ? 'secondary.main' : 'text.primary',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: 1,
          '&:hover': { bgcolor: selected ? 'ao.surface.selectedStrong' : 'ao.surface.hover' },
        }}
      >
        <InsertDriveFileOutlinedIcon sx={{ fontSize: 14, opacity: selected ? 0.9 : 0.65, flexShrink: 0 }} />
        <Typography
          variant="body2"
          noWrap
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            fontWeight: selected ? 600 : 400,
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          {name}
        </Typography>
        <Typography
          component="span"
          variant="caption"
          sx={{ color: STATUS_COLOR[file.status], fontWeight: 700, fontSize: 11, flexShrink: 0 }}
        >
          {STATUS_LETTER[file.status]}
        </Typography>
      </Box>
    </ControlTooltip>
  );
}

function FileTreeBranch({
  nodes,
  depth,
  selectedPath,
  expanded,
  onToggleDir,
  onSelectFile,
}: {
  nodes: FileTreeNode[];
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (file: DiffFile) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.type === 'dir' ? (
          <Box key={`dir:${node.path}`}>
            <DirRow node={node} depth={depth} expanded={expanded} onToggleDir={onToggleDir} />
            <Collapse in={expanded.has(node.path)} timeout="auto" unmountOnExit>
              <FileTreeBranch
                nodes={node.children}
                depth={depth + 1}
                selectedPath={selectedPath}
                expanded={expanded}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
              />
            </Collapse>
          </Box>
        ) : (
          <FileRow
            key={`file:${node.path}`}
            file={node.file}
            name={node.name}
            depth={depth}
            selected={selectedPath === node.path}
            onSelect={onSelectFile}
          />
        ),
      )}
    </>
  );
}

function VirtualFileTree({
  rows,
  selectedPath,
  expanded,
  onToggleDir,
  onSelectFile,
}: {
  rows: FlatFileTreeRow[];
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (file: DiffFile) => void;
}) {
  return (
    <Virtuoso
      style={{ height: '100%' }}
      data={rows}
      itemContent={(_index, row) =>
        row.type === 'dir' ? (
          <DirRow
            node={{ type: 'dir', name: row.name, path: row.path, children: [] }}
            depth={row.depth}
            expanded={expanded}
            onToggleDir={onToggleDir}
          />
        ) : (
          <FileRow
            file={row.file}
            name={row.name}
            depth={row.depth}
            selected={selectedPath === row.path}
            onSelect={onSelectFile}
          />
        )
      }
    />
  );
}

export interface ChangesDiffViewProps {
  patch: string;
}

/** File-tree + per-file diff viewer for an agent worktree patch. */
export function ChangesDiffView({ patch }: ChangesDiffViewProps) {
  const files = useMemo(() => parseUnifiedDiff(patch), [patch]);
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpanded(new Set(defaultExpandedDirs(tree)));
    setSelectedPath(files[0]?.path ?? null);
  }, [files, tree]);

  const flatRows = useMemo(() => flattenVisibleFileTree(tree, expanded), [tree, expanded]);
  const useVirtualTree = flatRows.length > FILE_TREE_VIRTUOSO_THRESHOLD;

  const selected = files.find((file) => file.path === selectedPath) ?? null;
  const preview = useMemo(
    () => (selected ? truncatePatch(selected.patch) : null),
    [selected],
  );
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
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
      <Typography variant="subtitle2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {files.length} {files.length === 1 ? 'file' : 'files'}
        {' · '}
        <Box component="span" sx={{ color: 'success.main' }}>
          +{totalAdditions}
        </Box>{' '}
        <Box component="span" sx={{ color: 'error.main' }}>
          −{totalDeletions}
        </Box>
      </Typography>

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
        <Box
          sx={{
            width: { xs: '100%', md: 280 },
            flexShrink: 0,
            maxHeight: { xs: 220, md: 'none' },
            height: { md: '100%' },
            borderRight: { md: 1 },
            borderBottom: { xs: 1, md: 0 },
            borderColor: 'divider',
            overflow: useVirtualTree ? 'hidden' : 'auto',
            bgcolor: 'ao.surface.inset',
            py: 0.75,
            px: 0.5,
          }}
        >
          {useVirtualTree ? (
            <VirtualFileTree
              rows={flatRows}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggleDir={toggleDir}
              onSelectFile={(file) => setSelectedPath(file.path)}
            />
          ) : (
            <FileTreeBranch
              nodes={tree}
              depth={0}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggleDir={toggleDir}
              onSelectFile={(file) => setSelectedPath(file.path)}
            />
          )}
        </Box>

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
            <EmptyState compact title="Select a file" description="Choose a file from the tree to view its diff." />
          )}
        </Box>
      </Stack>
    </Stack>
  );
}
