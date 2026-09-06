import { memo } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CommitOutlinedIcon from '@mui/icons-material/CommitOutlined';
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
}

/** Pending / PR diff viewer for an agent worktree. */
export const AgentChangesPanel = memo(function AgentChangesPanel({
  agentId,
  worktreePath,
  diffScope,
  onDiffScopeChange,
  enabled = true,
  archived = false,
  onCommit,
  onCommitAndPush,
}: AgentChangesPanelProps) {
  const diffQuery = useQuery({
    queryKey: ['diff', agentId, diffScope],
    queryFn: () => api.getDiff(agentId, diffScope),
    enabled: Boolean(agentId) && enabled,
  });

  const hasPatch = Boolean(diffQuery.data?.patch);
  const showCommitActions =
    !archived && diffScope === 'pending' && hasPatch && (onCommit || onCommitAndPush);

  return (
    <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0, p: { xs: 1.5, md: 1.25 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', flexShrink: 0 }}
      >
        <ControlTooltip title={worktreePath}>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{
              minWidth: 0,
              maxWidth: { sm: 280, md: 360 },
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 11.5,
            }}
          >
            {worktreePath}
          </Typography>
        </ControlTooltip>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}
        >
          {showCommitActions ? (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              {onCommit ? (
                <ControlTooltip title="Commit pending changes locally">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CommitOutlinedIcon />}
                    onClick={onCommit}
                  >
                    Commit
                  </Button>
                </ControlTooltip>
              ) : null}
              {onCommitAndPush ? (
                <ControlTooltip title="Commit pending changes and push to origin">
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<UploadOutlinedIcon />}
                    onClick={onCommitAndPush}
                  >
                    Commit &amp; push
                  </Button>
                </ControlTooltip>
              ) : null}
            </Stack>
          ) : null}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={diffScope}
            onChange={(_, value: AgentDiffScope | null) => {
              if (value) onDiffScopeChange(value);
            }}
            aria-label="Change scope"
          >
            <ControlTooltip title="Uncommitted changes in the working tree">
              <ToggleButton value="pending">Pending</ToggleButton>
            </ControlTooltip>
            <ControlTooltip title="All commits on this branch compared to the base branch">
              <ToggleButton value="pr">All PR changes</ToggleButton>
            </ControlTooltip>
          </ToggleButtonGroup>
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
        <EmptyState
          compact
          title={diffScope === 'pending' ? 'No pending changes' : 'No PR changes'}
          description={
            diffScope === 'pending'
              ? 'The working tree matches HEAD. Switch to All PR changes to see commits on this branch.'
              : 'No differences from the base branch.'
          }
        />
      ) : (
        <ChangesDiffView patch={diffQuery.data.patch} />
      )}
    </Stack>
  );
});
