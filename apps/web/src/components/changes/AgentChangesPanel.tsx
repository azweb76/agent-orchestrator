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
import { useQuery } from '@tanstack/react-query';
import type { AgentDiffScope } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { ChangesDiffView } from './ChangesDiffView';

export interface AgentChangesPanelProps {
  agentId: string;
  worktreePath: string;
  diffScope: AgentDiffScope;
  onDiffScopeChange: (scope: AgentDiffScope) => void;
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
          'The working tree matches HEAD. Switch to Unpushed or PR to review commits on this branch.',
      };
    case 'unpushed':
      return {
        title: 'No unpushed commits',
        description:
          'HEAD matches the upstream branch, or no upstream is set yet. Push once to establish tracking.',
      };
    case 'pr':
      return {
        title: 'No PR changes',
        description: 'No differences from the base branch.',
      };
  }
}

/** Diff viewer for an agent worktree: uncommitted, unpushed, or PR-scoped. */
export const AgentChangesPanel = memo(function AgentChangesPanel({
  agentId,
  worktreePath,
  diffScope,
  onDiffScopeChange,
  enabled = true,
  archived = false,
  onCommit,
  onCommitAndPush,
  onUndoFiles,
}: AgentChangesPanelProps) {
  const diffQuery = useQuery({
    queryKey: ['diff', agentId, diffScope],
    queryFn: () => api.getDiff(agentId, diffScope),
    enabled: Boolean(agentId) && enabled,
  });

  const [copiedPath, setCopiedPath] = useState(false);
  const hasPatch = Boolean(diffQuery.data?.patch);
  const showCommitActions =
    !archived && diffScope === 'pending' && hasPatch && (onCommit || onCommitAndPush);
  const empty = emptyCopy(diffScope);

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
          value={diffScope}
          onChange={(_, value: AgentDiffScope | null) => {
            if (value) onDiffScopeChange(value);
          }}
          aria-label="Change scope"
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
          <ToggleButton value="pr" title="All changes on this branch compared to the base branch">
            PR
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
          <ControlTooltip title="Reload the diff" disabled={diffQuery.isFetching}>
            <IconButton
              size="small"
              aria-label="Refresh changes"
              onClick={() => diffQuery.refetch()}
              disabled={diffQuery.isFetching}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </ControlTooltip>
        </Stack>
      </Stack>

      {diffQuery.isLoading ? (
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
          onUndoFiles={
            !archived && diffScope === 'pending' && onUndoFiles ? onUndoFiles : undefined
          }
        />
      )}
    </Stack>
  );
});
