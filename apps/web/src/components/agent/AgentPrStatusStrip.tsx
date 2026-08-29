import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentDetail, ChatSessionTemplateId } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { PullRequestStatusChip } from '../pr/PullRequestStatusChip';
import { PullRequestStatusIcon } from '../pr/PullRequestStatusIcon';
import { ControlTooltip } from '../ui/ControlTooltip';
import { pullRequestPath } from '../../utils/paths';
import { buildAgentPrStripModel } from './agentPrStatusModel';
import { useAgentLinkedPr } from './useAgentLinkedPr';

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
  const { enabled, owner, repo, prNumber, prKey, prQuery, checksQuery, pr, checks } =
    useAgentLinkedPr(agent);

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

  const markReady = useMutation({
    mutationFn: () => api.markPullRequestReady(owner, repo, prNumber!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prKey });
      queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['pulls-inbox'] });
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

  if (prQuery.error || !pr) {
    return (
      <Alert severity="warning" sx={{ py: 0.5 }}>
        Could not load PR #{prNumber}:{' '}
        {(prQuery.error as Error)?.message ?? 'unknown error'}
      </Alert>
    );
  }

  const model = buildAgentPrStripModel({
    pr,
    checks,
    archived,
  });
  const inAppPath = pullRequestPath(owner, repo, pr.number);

  return (
    <Alert
      severity={model.checksTone === 'error' ? 'error' : model.open ? 'info' : 'success'}
      icon={<PullRequestStatusIcon status={model.prStatus} fontSize="medium" />}
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
          {model.showMarkReady ? (
            <ControlTooltip title="Mark this draft ready for review" disabled={markReady.isPending}>
              <Button
                color="inherit"
                size="small"
                startIcon={<RateReviewOutlinedIcon />}
                disabled={markReady.isPending}
                onClick={() => markReady.mutate()}
              >
                {markReady.isPending ? 'Marking…' : 'Mark ready'}
              </Button>
            </ControlTooltip>
          ) : null}
          {model.showOpenPr ? (
            <ControlTooltip title="Open this pull request in the app">
              <Button color="inherit" size="small" component={RouterLink} to={inAppPath}>
                Open PR
              </Button>
            </ControlTooltip>
          ) : null}
        </Stack>
      }
    >
      <Stack spacing={0.75}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          #{pr.number} {pr.title}
        </Typography>
        <Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <PullRequestStatusChip status={model.prStatus} />
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
        {startTemplate.error || markReady.error ? (
          <Typography variant="caption" color="error">
            {((startTemplate.error ?? markReady.error) as Error).message}
          </Typography>
        ) : null}
      </Stack>
    </Alert>
  );
}
