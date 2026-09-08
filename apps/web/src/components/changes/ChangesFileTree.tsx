import type { ReactNode } from 'react';
import { Box, Collapse } from '@mui/material';
import { Virtuoso } from 'react-virtuoso';
import type { FileTreeNode } from '../../utils/fileTree';
import type { DiffFile } from '../../utils/parseUnifiedDiff';
import {
  FILE_TREE_VIRTUOSO_THRESHOLD,
  flattenVisibleFileTree,
  type FlatFileTreeRow,
} from './flattenFileTree';
import { collectTreeFiles, dirSelectState } from './discardPaths';
import { DirRow, FileRow } from './FileTreeRows';

/** Shared row wiring for both the nested and virtualized tree renderers. */
interface FileTreeRowProps<T extends { path: string }> {
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (file: T) => void;
  selectable?: boolean;
  selectedToUndo?: Set<string>;
  onToggleFile?: (file: T) => void;
  onToggleDirFiles?: (paths: string[]) => void;
  renderMeta?: (file: T) => ReactNode;
}

function FileTreeBranch<T extends { path: string }>({
  nodes,
  depth,
  ...rowProps
}: FileTreeRowProps<T> & { nodes: FileTreeNode<T>[]; depth: number }) {
  const {
    selectedPath,
    expanded,
    onToggleDir,
    onSelectFile,
    selectable,
    selectedToUndo,
    onToggleFile,
    onToggleDirFiles,
    renderMeta,
  } = rowProps;
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
                      collectTreeFiles([node]).map((file) => file.path),
                      selectedToUndo,
                    )
                  : undefined
              }
              onToggleSelect={() =>
                onToggleDirFiles?.(collectTreeFiles([node]).map((file) => file.path))
              }
            />
            <Collapse in={expanded.has(node.path)} timeout="auto" unmountOnExit>
              <FileTreeBranch nodes={node.children} depth={depth + 1} {...rowProps} />
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
            meta={renderMeta?.(node.file)}
          />
        ),
      )}
    </>
  );
}

function VirtualFileTree<T extends { path: string }>({
  rows,
  selectedPath,
  expanded,
  onToggleDir,
  onSelectFile,
  selectable,
  selectedToUndo,
  onToggleFile,
  onToggleDirFiles,
  renderMeta,
}: FileTreeRowProps<T> & { rows: FlatFileTreeRow<T>[] }) {
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
            meta={renderMeta?.(row.file)}
          />
        )
      }
    />
  );
}

export type ChangesFileTreeProps<T extends { path: string } = DiffFile> = FileTreeRowProps<T> & {
  tree: FileTreeNode<T>[];
};

/** Scrollable file tree for the Changes diff viewer and the worktree file browser. */
export function ChangesFileTree<T extends { path: string } = DiffFile>({
  tree,
  ...rowProps
}: ChangesFileTreeProps<T>) {
  const flatRows = flattenVisibleFileTree(tree, rowProps.expanded);
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
        <VirtualFileTree rows={flatRows} {...rowProps} />
      ) : (
        <FileTreeBranch nodes={tree} depth={0} {...rowProps} />
      )}
    </Box>
  );
}
