import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentDetail, ChatSessionTemplateId } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { pullRequestPath } from '../../utils/paths';
import { buildAgentPrStripModel } from './agentPrStatusModel';

export interface AgentPrStatusStripProps {
  agent: AgentDetail;
  archived: boolean;
  onSessionStarted?: (sessionId: string) => void;
}

/**
 * Persistent PR health strip on the agent page: draft/open, checks, review
 * comments, and one-click Fix CI / Address review using the linked PR.
 */
export function AgentPrStatusStrip({ agent, archived, onSessionStarted }: AgentPrStatusStripProps) {
  const queryClient = useQueryClient();
  const prNumber = agent.worktree.prNumber;
  const owner = agent.workspace.githubOwner;
  const repo = agent.workspace.githubRepo;

  const prKey = ['pr', owner, repo, prNumber];
  const enabled = prNumber != null && prNumber > 0;

  const prQuery = useQuery({
    queryKey: prKey,
    queryFn: () => api.getPullRequest(owner, repo, prNumber!),
    enabled,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.merged || data.state !== 'open') return false;
      return data.mergeableState === 'unknown' ? 3000 : 30_000;
    },
  });

  const checksQuery = useQuery({
    queryKey: [...prKey, 'checks'],
    queryFn: () => api.getPullRequestChecks(owner, repo, prNumber!),
    enabled: enabled && Boolean(prQuery.data) && prQuery.data?.state === 'open' && !prQuery.data.merged,
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.checks.some((check) => check.status !== 'completed') ? 10_000 : false,
  });

  const startTemplate = useMutation({
    mutationFn: async (template: Extract<ChatSessionTemplateId, 'fix-ci' | 'address-review'>) => {
      const result = await api.createAgentFromPr({
        owner,
        repo,
        prNumber: prNumber!,
        template,
      });
      return { sessionId: result.sessionId, agentId: result.agent.id };
    },
    onSuccess: ({ sessionId, agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: prKey });
      if (sessionId) onSessionStarted?.(sessionId);
    },
  });

  if (!enabled) return null;

  if (prQuery.isLoading) {
    return (
      <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ py: 0.5 }}>
        Loading pull request #{prNumber}…
      </Alert>
    );
  }

  if (prQuery.error || !prQuery.data) {
    return (
      <Alert severity="warning" sx={{ py: 0.5 }}>
        Could not load PR #{prNumber}:{' '}
        {(prQuery.error as Error)?.message ?? 'unknown error'}
      </Alert>
    );
  }

  const pr = prQuery.data;
  const model = buildAgentPrStripModel({
    pr,
    checks: checksQuery.data,
    archived,
  });
  const inAppPath = pullRequestPath(owner, repo, pr.number);

  return (
    <Alert
      severity={model.checksTone === 'error' ? 'error' : model.open ? 'info' : 'success'}
      icon={<MergeTypeIcon />}
      sx={{ py: 0.75, '& .MuiAlert-message': { width: '100%', minWidth: 0 } }}
      action={
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {model.showFixCi ? (
            <ControlTooltip title="Start a Fix CI session for this pull request" disabled={startTemplate.isPending}>
              <Button
                color="inherit"
                size="small"
                startIcon={<BugReportOutlinedIcon />}
                disabled={startTemplate.isPending}
                onClick={() => startTemplate.mutate('fix-ci')}
              >
                {startTemplate.isPending && startTemplate.variables === 'fix-ci' ? 'Starting…' : 'Fix CI'}
              </Button>
            </ControlTooltip>
          ) : null}
          {model.showAddressReview ? (
            <ControlTooltip
              title="Start an Address review session for this pull request"
              disabled={startTemplate.isPending}
            >
              <Button
                color="inherit"
                size="small"
                startIcon={<ReplyOutlinedIcon />}
                disabled={startTemplate.isPending}
                onClick={() => startTemplate.mutate('address-review')}
              >
                {startTemplate.isPending && startTemplate.variables === 'address-review'
                  ? 'Starting…'
                  : 'Address review'}
              </Button>
            </ControlTooltip>
          ) : null}
          <ControlTooltip title="Open this pull request in the app">
            <Button color="inherit" size="small" component={RouterLink} to={inAppPath}>
              Open PR
            </Button>
          </ControlTooltip>
        </Stack>
      }
    >
      <Stack spacing={0.75}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          #{pr.number} {pr.title}
        </Typography>
        <Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Chip size="small" variant="outlined" label={model.stateLabel} />
            {model.checksLabel ? (
              <Chip
                size="small"
                variant="outlined"
                color={model.checksTone === 'default' ? undefined : model.checksTone}
                label={model.checksLabel}
              />
            ) : checksQuery.isLoading ? (
              <Chip size="small" variant="outlined" label="Loading checks…" />
            ) : null}
            {model.reviewLabel ? (
              <Chip size="small" variant="outlined" label={model.reviewLabel} />
            ) : null}
            {model.mergeHint ? (
              <Chip size="small" variant="outlined" label={model.mergeHint} />
            ) : null}
          </Stack>
        </Box>
        {startTemplate.error ? (
          <Typography variant="caption" color="error">
            {(startTemplate.error as Error).message}
          </Typography>
        ) : null}
      </Stack>
    </Alert>
  );
}
