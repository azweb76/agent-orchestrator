import { memo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import CommitOutlinedIcon from '@mui/icons-material/CommitOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentDiffScope } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { ChangesDiffView } from './ChangesDiffView';
import { WorktreeFilesView } from './WorktreeFilesView';
import { isDiffScope, type FilesViewMode } from './filesViewMode';

export interface AgentChangesPanelProps {
  agentId: string;
  worktreePath: string;
  mode: FilesViewMode;
  onModeChange: (mode: FilesViewMode) => void;
  enabled?: boolean;
  archived?: boolean;
  onCommit?: () => void;
  onCommitAndPush?: () => void;
  onUndoFiles?: (paths: string[]) => void;
}

function emptyCopy(scope: AgentDiffScope): { title: string; description: string } {
  switch (scope) {
    case 'pending':
      return {
        title: 'No uncommitted changes',
        description:
          'The working tree matches HEAD. Switch to Unpushed or Branch to review commits on this branch.',
      };
    case 'unpushed':
      return {
        title: 'No unpushed commits',
        description:
          'HEAD matches the upstream branch, or no upstream is set yet. Push once to establish tracking.',
      };
    case 'branch':
      return {
        title: 'No branch changes',
        description: 'No differences from the base branch.',
      };
  }
}

/** Files viewer for an agent worktree: uncommitted, unpushed, branch diffs, or all files. */
export const AgentChangesPanel = memo(function AgentChangesPanel({
  agentId,
  worktreePath,
  mode,
  onModeChange,
  enabled = true,
  archived = false,
  onCommit,
  onCommitAndPush,
  onUndoFiles,
}: AgentChangesPanelProps) {
  const scope: AgentDiffScope = isDiffScope(mode) ? mode : 'pending';
  const diffQuery = useQuery({
    queryKey: ['diff', agentId, scope],
    queryFn: () => api.getDiff(agentId, scope),
    enabled: Boolean(agentId) && enabled && isDiffScope(mode),
  });
  const queryClient = useQueryClient();
  const filesFetching = useIsFetching({ queryKey: ['mention-files', agentId] }) > 0;

  const [copiedPath, setCopiedPath] = useState(false);
  const hasPatch = Boolean(diffQuery.data?.patch);
  const showCommitActions =
    !archived && mode === 'pending' && hasPatch && (onCommit || onCommitAndPush);
  const empty = emptyCopy(scope);
  const refreshing = mode === 'all' ? filesFetching : diffQuery.isFetching;

  const refresh = () => {
    if (mode === 'all') {
      void queryClient.invalidateQueries({ queryKey: ['mention-files', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['worktree-file', agentId] });
      return;
    }
    void diffQuery.refetch();
  };

  const copyWorktreePath = async () => {
    try {
      await navigator.clipboard.writeText(worktreePath);
      setCopiedPath(true);
      window.setTimeout(() => setCopiedPath(false), 1500);
    } catch {
      setCopiedPath(false);
    }
  };

  return (
    <Stack spacing={1} sx={{ height: '100%', minHeight: 0, p: { xs: 1.25, md: 1 } }}>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          flexWrap: 'wrap',
          rowGap: 0.5,
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, value: FilesViewMode | null) => {
            if (value) onModeChange(value);
          }}
          aria-label="Files view mode"
          sx={{
            '& .MuiToggleButton-root': {
              px: 1.1,
              py: 0.25,
              textTransform: 'none',
              fontSize: 12.5,
              lineHeight: 1.35,
            },
          }}
        >
          <ToggleButton value="pending" title="Uncommitted changes in the working tree">
            Uncommitted
          </ToggleButton>
          <ToggleButton value="unpushed" title="Local commits not yet on the upstream branch">
            Unpushed
          </ToggleButton>
          <ToggleButton value="branch" title="All changes on this branch compared to the base branch">
            Branch
          </ToggleButton>
          <ToggleButton value="all" title="Browse every file in the worktree">
            All
          </ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" spacing={0.15} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <ControlTooltip title={copiedPath ? 'Copied' : `Copy ${worktreePath}`}>
            <IconButton
              size="small"
              aria-label="Copy worktree path"
              onClick={() => void copyWorktreePath()}
            >
              <FolderOpenOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </ControlTooltip>
          {showCommitActions ? (
            <>
              {onCommit ? (
                <ControlTooltip title="Commit">
                  <IconButton size="small" aria-label="Commit" onClick={onCommit}>
                    <CommitOutlinedIcon fontSize="small" />
                  </IconButton>
                </ControlTooltip>
              ) : null}
              {onCommitAndPush ? (
                <ControlTooltip title="Commit & push">
                  <IconButton
                    size="small"
                    aria-label="Commit and push"
                    onClick={onCommitAndPush}
                    color="primary"
                  >
                    <UploadOutlinedIcon fontSize="small" />
                  </IconButton>
                </ControlTooltip>
              ) : null}
            </>
          ) : null}
          <ControlTooltip
            title={mode === 'all' ? 'Reload the file list' : 'Reload the diff'}
            disabled={refreshing}
          >
            <IconButton
              size="small"
              aria-label="Refresh changes"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
        </Stack>
      </Stack>

      {mode === 'all' ? (
        <WorktreeFilesView agentId={agentId} />
      ) : diffQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : diffQuery.error ? (
        <Alert severity="error">{(diffQuery.error as Error).message}</Alert>
      ) : !diffQuery.data?.patch ? (
        <EmptyState compact title={empty.title} description={empty.description} />
      ) : (
        <ChangesDiffView
          patch={diffQuery.data.patch}
          onUndoFiles={!archived && mode === 'pending' && onUndoFiles ? onUndoFiles : undefined}
        />
      )}
    </Stack>
  );
});
