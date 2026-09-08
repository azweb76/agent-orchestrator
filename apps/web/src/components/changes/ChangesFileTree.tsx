import { Box, Checkbox, Collapse, Typography } from '@mui/material';
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
import { collectDiffFiles, dirSelectState } from './discardPaths';

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
  selectable,
  dirState,
  onToggleSelect,
}: {
  node: FileTreeDirNode;
  depth: number;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  selectable?: boolean;
  dirState?: 'none' | 'some' | 'all';
  onToggleSelect?: () => void;
}) {
  const isOpen = expanded.has(node.path);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pl: 0.25 + depth * 1.25 }}>
      {selectable ? (
        <Checkbox
          size="small"
          checked={dirState === 'all'}
          indeterminate={dirState === 'some'}
          onChange={() => onToggleSelect?.()}
          slotProps={{ input: { 'aria-label': `Select files in ${node.name}` } }}
          sx={{ p: 0.25, ml: 0.25, flexShrink: 0 }}
        />
      ) : null}
      <Box
        component="button"
        type="button"
        onClick={() => onToggleDir(node.path)}
        aria-expanded={isOpen}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flex: 1,
          minWidth: 0,
          pl: 0,
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
    </Box>
  );
}

function FileRow({
  file,
  name,
  depth,
  selected,
  onSelect,
  selectable,
  checked,
  onToggleSelect,
}: {
  file: DiffFile;
  name: string;
  depth: number;
  selected: boolean;
  onSelect: (file: DiffFile) => void;
  selectable?: boolean;
  checked?: boolean;
  onToggleSelect?: (file: DiffFile) => void;
}) {
  return (
    <ControlTooltip title={file.path}>
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pl: 0.25 + depth * 1.25 }}>
      {selectable ? (
        <Checkbox
          size="small"
          checked={Boolean(checked)}
          onChange={() => onToggleSelect?.(file)}
          slotProps={{ input: { 'aria-label': `Select ${name} to undo` } }}
          sx={{ p: 0.25, ml: 0.25, flexShrink: 0 }}
        />
      ) : null}
      <Box
        component="button"
        type="button"
        onClick={() => onSelect(file)}
        aria-current={selected ? 'true' : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flex: 1,
          minWidth: 0,
          pl: 0,
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
  selectable,
  selectedToUndo,
  onToggleFile,
  onToggleDirFiles,
}: {
  nodes: FileTreeNode[];
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (file: DiffFile) => void;
  selectable?: boolean;
  selectedToUndo?: Set<string>;
  onToggleFile?: (file: DiffFile) => void;
  onToggleDirFiles?: (paths: string[]) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.type === 'dir' ? (
          <Box key={`dir:${node.path}`}>
            <DirRow
              node={node}
              depth={depth}
              expanded={expanded}
              onToggleDir={onToggleDir}
              selectable={selectable}
              dirState={
                selectable && selectedToUndo
                  ? dirSelectState(
                      collectDiffFiles([node]).map((file) => file.path),
                      selectedToUndo,
                    )
                  : undefined
              }
              onToggleSelect={() =>
                onToggleDirFiles?.(collectDiffFiles([node]).map((file) => file.path))
              }
            />
            <Collapse in={expanded.has(node.path)} timeout="auto" unmountOnExit>
              <FileTreeBranch
                nodes={node.children}
                depth={depth + 1}
                selectedPath={selectedPath}
                expanded={expanded}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                selectable={selectable}
                selectedToUndo={selectedToUndo}
                onToggleFile={onToggleFile}
                onToggleDirFiles={onToggleDirFiles}
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
            selectable={selectable}
            checked={selectedToUndo?.has(node.path)}
            onToggleSelect={onToggleFile}
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
  selectable,
  selectedToUndo,
  onToggleFile,
  onToggleDirFiles,
}: {
  rows: FlatFileTreeRow[];
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (file: DiffFile) => void;
  selectable?: boolean;
  selectedToUndo?: Set<string>;
  onToggleFile?: (file: DiffFile) => void;
  onToggleDirFiles?: (paths: string[]) => void;
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
            selectable={selectable}
            dirState={
              selectable && selectedToUndo
                ? dirSelectState(row.filePaths, selectedToUndo)
                : undefined
            }
            onToggleSelect={() => onToggleDirFiles?.(row.filePaths)}
          />
        ) : (
          <FileRow
            file={row.file}
            name={row.name}
            depth={row.depth}
            selected={selectedPath === row.path}
            onSelect={onSelectFile}
            selectable={selectable}
            checked={selectedToUndo?.has(row.path)}
            onToggleSelect={onToggleFile}
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
  selectable?: boolean;
  selectedToUndo?: Set<string>;
  onToggleFile?: (file: DiffFile) => void;
  onToggleDirFiles?: (paths: string[]) => void;
}

/** Scrollable file tree for the Changes diff viewer. */
export function ChangesFileTree({
  tree,
  selectedPath,
  expanded,
  onToggleDir,
  onSelectFile,
  selectable,
  selectedToUndo,
  onToggleFile,
  onToggleDirFiles,
}: ChangesFileTreeProps) {
  const flatRows = flattenVisibleFileTree(tree, expanded);
  const useVirtualTree = flatRows.length > FILE_TREE_VIRTUOSO_THRESHOLD;
  const selectProps = { selectable, selectedToUndo, onToggleFile, onToggleDirFiles };

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
          {...selectProps}
        />
      ) : (
        <FileTreeBranch
          nodes={tree}
          depth={0}
          selectedPath={selectedPath}
          expanded={expanded}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          {...selectProps}
        />
      )}
    </Box>
  );
}
