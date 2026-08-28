import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';
import { useQuery } from '@tanstack/react-query';
import type { AgentDiffScope } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { EmptyState } from '../ui/EmptyState';
import { ChangesDiffView } from './ChangesDiffView';

export interface AgentChangesPanelProps {
  agentId: string;
  worktreePath: string;
  archived: boolean;
  diffScope: AgentDiffScope;
  onDiffScopeChange: (scope: AgentDiffScope) => void;
  onCommitClick: () => void;
  enabled?: boolean;
}

/** Pending / PR diff viewer for an agent worktree. */
export function AgentChangesPanel({
  agentId,
  worktreePath,
  archived,
  diffScope,
  onDiffScopeChange,
  onCommitClick,
  enabled = true,
}: AgentChangesPanelProps) {
  const diffQuery = useQuery({
    queryKey: ['diff', agentId, diffScope],
    queryFn: () => api.getDiff(agentId, diffScope),
    enabled: Boolean(agentId) && enabled,
  });

  return (
    <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0, p: { xs: 1.5, md: 1.25 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', flexShrink: 0 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Local path
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {worktreePath}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={diffScope}
            onChange={(_, value: AgentDiffScope | null) => {
              if (value) onDiffScopeChange(value);
            }}
            aria-label="Change scope"
          >
            <ToggleButton value="pending">Pending</ToggleButton>
            <ToggleButton value="pr">All PR changes</ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Refresh">
            <span>
              <IconButton
                size="small"
                aria-label="Refresh changes"
                onClick={() => diffQuery.refetch()}
                disabled={diffQuery.isFetching}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadOutlinedIcon />}
            disabled={archived || !diffQuery.data?.patch}
            onClick={onCommitClick}
          >
            Commit & push
          </Button>
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
}
