import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { WorkspaceAiCheck, WorkspaceAiCheckStatus } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { ControlTooltip } from './ui/ControlTooltip';

function statusColor(
  status: WorkspaceAiCheckStatus,
): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'pass') return 'success';
  if (status === 'warn') return 'warning';
  if (status === 'fail') return 'error';
  return 'default';
}

function CheckRow({ check }: { check: WorkspaceAiCheck }) {
  return (
    <ListItem alignItems="flex-start" sx={{ px: 0 }}>
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="subtitle2">{check.title}</Typography>
            <Chip size="small" label={check.status} color={statusColor(check.status)} variant="outlined" />
          </Stack>
        }
        secondary={
          <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" component="span" sx={{ display: 'block' }}>
              {check.detail}
            </Typography>
            {check.status !== 'pass' && check.status !== 'info' ? (
              <Typography variant="body2" component="span" sx={{ display: 'block', mt: 0.5 }}>
                Fix: {check.recommendation}
              </Typography>
            ) : null}
          </Box>
        }
      />
    </ListItem>
  );
}

export function WorkspaceAiReadinessPanel({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const readinessQuery = useQuery({
    queryKey: ['workspace-ai-readiness', workspaceId],
    queryFn: () => api.getAiReadiness(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const implement = useMutation({
    mutationFn: () => api.createAiReadinessAgent(workspaceId, { task: 'auto' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      navigate(`/agents/${data.agent.id}`, {
        state: { initialPrompt: data.kickoffPrompt },
      });
    },
  });

  if (readinessQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (readinessQuery.error || !readinessQuery.data) {
    return (
      <Alert severity="error">
        {(readinessQuery.error as Error)?.message ?? 'Failed to analyze AI readiness'}
      </Alert>
    );
  }

  const readiness = readinessQuery.data;
  const scorePct =
    readiness.maxScore > 0 ? Math.round((readiness.score / readiness.maxScore) * 100) : 0;
  const needsWork = readiness.checks.some((c) => c.status === 'fail' || c.status === 'warn');

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6">AI Readiness</Typography>
          <Typography variant="body2" color="text.secondary">
            Analyzed {readiness.analyzedRef}
            {readiness.analyzedSha ? ` @ ${readiness.analyzedSha}` : ''} · score {readiness.score}/
            {readiness.maxScore}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={scorePct}
            sx={{ mt: 1, height: 8, borderRadius: 1, maxWidth: 360 }}
          />
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <ControlTooltip title="Re-run deterministic checks and LLM advice">
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => readinessQuery.refetch()}
              disabled={readinessQuery.isFetching}
            >
              Refresh
            </Button>
          </ControlTooltip>
          <ControlTooltip title="Create an agent on a new branch to implement the recommended instruction-file improvements">
            <span>
              <Button
                variant="contained"
                startIcon={<AutoFixHighIcon />}
                disabled={!needsWork || implement.isPending}
                onClick={() => implement.mutate()}
              >
                {implement.isPending ? 'Creating…' : 'Create agent to implement'}
              </Button>
            </span>
          </ControlTooltip>
        </Stack>
      </Stack>

      {implement.error ? (
        <Alert severity="error">{(implement.error as Error).message}</Alert>
      ) : null}

      {readiness.llmError ? (
        <Alert severity="warning">
          LLM advice unavailable: {readiness.llmError}. Showing checklist only.
        </Alert>
      ) : null}

      {readiness.llm ? (
        <Alert severity="info" sx={{ '& .MuiAlert-message': { width: '100%' } }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            LLM summary
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {readiness.llm.summary}
          </Typography>
          {readiness.llm.priorities.length > 0 ? (
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {readiness.llm.priorities.map((item) => (
                <li key={item}>
                  <Typography variant="body2">{item}</Typography>
                </li>
              ))}
            </Box>
          ) : null}
        </Alert>
      ) : null}

      <List disablePadding>
        {readiness.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </List>

      {readiness.skillPaths.length > 0 ? (
        <Typography variant="body2" color="text.secondary">
          Skills: {readiness.skillPaths.join(', ')}
        </Typography>
      ) : null}
    </Stack>
  );
}
