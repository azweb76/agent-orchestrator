import { Box, Collapse, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { Virtuoso } from 'react-virtuoso';
import { ControlTooltip } from '../ui/ControlTooltip';
import type { FileTreeDirNode, FileTreeNode } from '../../utils/fileTree';
import type { DiffFile, DiffFileStatus } from '../../utils/parseUnifiedDiff';
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
          gap: 0.5,
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
        <InsertDriveFileOutlinedIcon
          sx={{ fontSize: 14, opacity: selected ? 0.9 : 0.65, flexShrink: 0 }}
        />
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
          sx={{ color: 'success.main', fontSize: 10.5, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          +{file.additions}
        </Typography>
        <Typography
          component="span"
          variant="caption"
          sx={{ color: 'error.main', fontSize: 10.5, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          −{file.deletions}
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

export interface ChangesFileTreeProps {
  tree: FileTreeNode[];
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (file: DiffFile) => void;
}

/** Scrollable file tree for the Changes diff viewer. */
export function ChangesFileTree({
  tree,
  selectedPath,
  expanded,
  onToggleDir,
  onSelectFile,
}: ChangesFileTreeProps) {
  const flatRows = flattenVisibleFileTree(tree, expanded);
  const useVirtualTree = flatRows.length > FILE_TREE_VIRTUOSO_THRESHOLD;

  return (
    <Box
      sx={{
        height: '100%',
        overflow: useVirtualTree ? 'hidden' : 'auto',
        py: 0.25,
        px: 0.5,
      }}
    >
      {useVirtualTree ? (
        <VirtualFileTree
          rows={flatRows}
          selectedPath={selectedPath}
          expanded={expanded}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
        />
      ) : (
        <FileTreeBranch
          nodes={tree}
          depth={0}
          selectedPath={selectedPath}
          expanded={expanded}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
        />
      )}
    </Box>
  );
}
