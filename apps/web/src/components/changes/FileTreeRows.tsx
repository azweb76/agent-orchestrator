import type { ReactNode } from 'react';
import { Box, Checkbox, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { ControlTooltip } from '../ui/ControlTooltip';
import type { FileTreeDirNode } from '../../utils/fileTree';

export function DirRow<T>({
  node,
  depth,
  expanded,
  onToggleDir,
  selectable,
  dirState,
  onToggleSelect,
}: {
  node: FileTreeDirNode<T>;
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

export function FileRow<T extends { path: string }>({
  file,
  name,
  depth,
  selected,
  onSelect,
  selectable,
  checked,
  onToggleSelect,
  meta,
}: {
  file: T;
  name: string;
  depth: number;
  selected: boolean;
  onSelect: (file: T) => void;
  selectable?: boolean;
  checked?: boolean;
  onToggleSelect?: (file: T) => void;
  /** Trailing badges (diff stats, status letter) rendered after the file name. */
  meta?: ReactNode;
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
        {meta}
      </Box>
      </Box>
    </ControlTooltip>
  );
}
