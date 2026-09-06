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
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { WorkspaceAiCheck, WorkspaceAiCheckStatus, WorkspaceAiReadiness } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { ControlTooltip } from './ui/ControlTooltip';
import { EmptyState } from './ui/EmptyState';

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

function ReadinessResult({
  readiness,
  analyzing,
  onRefresh,
  implementPending,
  implementError,
  onImplement,
}: {
  readiness: WorkspaceAiReadiness;
  analyzing: boolean;
  onRefresh: () => void;
  implementPending: boolean;
  implementError: Error | null;
  onImplement: () => void;
}) {
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
            {readiness.maxScore} · cached {new Date(readiness.checkedAt).toLocaleString()}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={scorePct}
            sx={{ mt: 1, height: 8, borderRadius: 1, maxWidth: 360 }}
          />
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <ControlTooltip title="Re-run deterministic checks and LLM advice, then update the cache">
            <Button
              variant="outlined"
              startIcon={analyzing ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={onRefresh}
              disabled={analyzing}
            >
              {analyzing ? 'Analyzing…' : 'Refresh'}
            </Button>
          </ControlTooltip>
          <ControlTooltip title="Create an agent on a new branch to implement the recommended instruction-file improvements">
            <span>
              <Button
                variant="contained"
                startIcon={<AutoFixHighIcon />}
                disabled={!needsWork || implementPending || analyzing}
                onClick={onImplement}
              >
                {implementPending ? 'Creating…' : 'Create agent to implement'}
              </Button>
            </span>
          </ControlTooltip>
        </Stack>
      </Stack>

      {implementError ? <Alert severity="error">{implementError.message}</Alert> : null}

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

export function WorkspaceAiReadinessPanel({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cacheKey = ['workspace-ai-readiness', workspaceId] as const;

  const cacheQuery = useQuery({
    queryKey: cacheKey,
    queryFn: () => api.getAiReadiness(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const analyze = useMutation({
    mutationFn: () => api.analyzeAiReadiness(workspaceId),
    onSuccess: (readiness) => {
      queryClient.setQueryData(cacheKey, { readiness });
    },
  });

  const implement = useMutation({
    mutationFn: () => api.createAiReadinessAgent(workspaceId, { task: 'auto' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.setQueryData(cacheKey, { readiness: data.readiness });
      navigate(`/agents/${data.agent.id}`, {
        state: { initialPrompt: data.kickoffPrompt },
      });
    },
  });

  if (cacheQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (cacheQuery.error) {
    return (
      <Alert severity="error">
        {(cacheQuery.error as Error)?.message ?? 'Failed to load AI readiness cache'}
      </Alert>
    );
  }

  const readiness = cacheQuery.data?.readiness ?? null;

  if (!readiness) {
    return (
      <Stack spacing={2}>
        {analyze.error ? (
          <Alert severity="error">{(analyze.error as Error).message}</Alert>
        ) : null}
        <EmptyState
          compact
          icon={<AssessmentOutlinedIcon />}
          title="AI Readiness not analyzed yet"
          description="Run analysis on the default branch to check CLAUDE.md / AGENTS.md setup. Results are cached until you refresh."
          action={
            <Button
              variant="contained"
              startIcon={analyze.isPending ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              disabled={analyze.isPending}
              onClick={() => analyze.mutate()}
            >
              {analyze.isPending ? 'Analyzing…' : 'Run analysis'}
            </Button>
          }
        />
      </Stack>
    );
  }

  return (
    <ReadinessResult
      readiness={readiness}
      analyzing={analyze.isPending}
      onRefresh={() => analyze.mutate()}
      implementPending={implement.isPending}
      implementError={(implement.error as Error | null) ?? null}
      onImplement={() => implement.mutate()}
    />
  );
}
