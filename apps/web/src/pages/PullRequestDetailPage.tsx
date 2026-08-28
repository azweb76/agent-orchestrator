import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
} from '@mui/material';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { evaluateMergeReadiness } from '@agent-orchestrator/shared';
import type { ChatSessionTemplateId, PullRequestDetail } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { MergeActions } from '../components/pr/MergeActions';
import { MergeReadinessPanel } from '../components/pr/MergeReadinessPanel';
import { PullRequestChecksTab } from '../components/pr/PullRequestChecksTab';
import { PullRequestCommitsTab } from '../components/pr/PullRequestCommitsTab';
import { PullRequestConversationTab } from '../components/pr/PullRequestConversationTab';
import { PullRequestFilesTab } from '../components/pr/PullRequestFilesTab';
import { PullRequestOverviewTab } from '../components/pr/PullRequestOverviewTab';
import { PullRequestReviewsTab } from '../components/pr/PullRequestReviewsTab';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageBreadcrumbs } from '../components/ui/PageBreadcrumbs';
import { PageHeader } from '../components/ui/PageHeader';

type PrTab = 'overview' | 'checks' | 'files' | 'commits' | 'reviews' | 'conversation';

export function PullRequestDetailPage() {
  const { owner = '', repo = '', number = '' } = useParams();
  const prNumber = Number(number);

  if (!owner || !repo || !Number.isInteger(prNumber) || prNumber <= 0) {
    return <Alert severity="error">Invalid pull request URL.</Alert>;
  }

  // Remount on route change so tab and dialog state cannot leak between PRs.
  return (
    <PullRequestDetailContent
      key={`${owner}/${repo}#${prNumber}`}
      owner={owner}
      repo={repo}
      prNumber={prNumber}
    />
  );
}

function statusChip(pr: PullRequestDetail) {
  if (pr.merged) return <Chip size="small" label="Merged" color="secondary" variant="outlined" />;
  if (pr.state === 'closed') return <Chip size="small" label="Closed" color="error" variant="outlined" />;
  if (pr.draft) return <Chip size="small" label="Draft" variant="outlined" />;
  return <Chip size="small" label="Open" color="success" variant="outlined" />;
}

function PullRequestDetailContent({
  owner,
  repo,
  prNumber,
}: {
  owner: string;
  repo: string;
  prNumber: number;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PrTab>('overview');

  const prKey = ['pr', owner, repo, prNumber];

  const prQuery = useQuery({
    queryKey: prKey,
    queryFn: () => api.getPullRequest(owner, repo, prNumber),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.merged || data.state !== 'open') return false;
      // GitHub computes mergeability asynchronously; poll hard until it settles.
      return data.mergeableState === 'unknown' ? 3000 : 15000;
    },
  });

  const checksQuery = useQuery({
    queryKey: [...prKey, 'checks'],
    queryFn: () => api.getPullRequestChecks(owner, repo, prNumber),
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.checks.some((check) => check.status !== 'completed') ? 10_000 : false,
  });

  const reviewsQuery = useQuery({
    queryKey: [...prKey, 'reviews'],
    queryFn: () => api.getPullRequestReviews(owner, repo, prNumber),
    staleTime: 30_000,
  });

  const filesQuery = useQuery({
    queryKey: [...prKey, 'files'],
    queryFn: () => api.getPullRequestFiles(owner, repo, prNumber),
    enabled: tab === 'files',
    staleTime: 30_000,
  });

  const commitsQuery = useQuery({
    queryKey: [...prKey, 'commits'],
    queryFn: () => api.getPullRequestCommits(owner, repo, prNumber),
    enabled: tab === 'commits',
    staleTime: 30_000,
  });

  const commentsQuery = useQuery({
    queryKey: [...prKey, 'comments'],
    queryFn: () => api.getPullRequestComments(owner, repo, prNumber),
    enabled: tab === 'conversation',
    staleTime: 30_000,
  });

  const createAgent = useMutation({
    mutationFn: () => api.createAgentFromPr({ owner, repo, prNumber }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: prKey });
      navigate(`/agents/${result.agent.id}`);
    },
  });

  const startTemplate = useMutation({
    mutationFn: async (template: ChatSessionTemplateId) => {
      const result = await api.createAgentFromPr({ owner, repo, prNumber });
      return { agentId: result.agent.id, template };
    },
    onSuccess: ({ agentId, template }) => {
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: prKey });
      navigate(`/agents/${agentId}`, { state: { sessionTemplate: template } });
    },
  });

  const submitReview = useMutation({
    mutationFn: (input: { event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body: string }) =>
      api.submitPullRequestReview(owner, repo, prNumber, {
        event: input.event,
        body: input.body || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...prKey, 'reviews'] });
      queryClient.invalidateQueries({ queryKey: prKey });
    },
  });

  const submitComment = useMutation({
    mutationFn: (body: string) => api.createPullRequestComment(owner, repo, prNumber, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...prKey, 'comments'] });
      queryClient.invalidateQueries({ queryKey: prKey });
    },
  });

  if (prQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (prQuery.error || !prQuery.data) {
    return (
      <Stack spacing={2}>
        <PageBreadcrumbs
          items={[{ label: 'Pull requests', to: '/pull-requests' }, { label: `#${prNumber}` }]}
        />
        <Alert severity="error">
          {(prQuery.error as Error)?.message ?? 'Pull request not found'}
        </Alert>
      </Stack>
    );
  }

  const pr = prQuery.data;
  const readiness = evaluateMergeReadiness(pr);

  return (
    <Stack spacing={2.5}>
      <PageHeader
        breadcrumbs={
          <PageBreadcrumbs
            items={[
              { label: 'Pull requests', to: '/pull-requests' },
              { label: `${owner}/${repo}` },
              { label: `#${pr.number}` },
            ]}
          />
        }
        eyebrow={`${owner}/${repo}`}
        title={
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Box component="span">
              #{pr.number} {pr.title}
            </Box>
            {statusChip(pr)}
          </Stack>
        }
        actions={
          <>
            {pr.state === 'open' && !pr.merged && (checksQuery.data?.failing ?? 0) > 0 ? (
              <ControlTooltip
                title="Start a Claude agent to fix failing CI checks"
                disabled={startTemplate.isPending}
              >
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<BugReportOutlinedIcon />}
                  disabled={startTemplate.isPending}
                  onClick={() => startTemplate.mutate('fix-ci')}
                >
                  Fix CI
                </Button>
              </ControlTooltip>
            ) : null}
            {pr.state === 'open' && !pr.merged ? (
              <ControlTooltip
                title="Start a Claude agent to address review feedback"
                disabled={startTemplate.isPending}
              >
                <Button
                  variant="outlined"
                  startIcon={<ReplyOutlinedIcon />}
                  disabled={startTemplate.isPending}
                  onClick={() => startTemplate.mutate('address-review')}
                >
                  Address review
                </Button>
              </ControlTooltip>
            ) : null}
            {pr.agentId ? (
              <ControlTooltip title="Open the agent working on this pull request">
                <Button
                  component={RouterLink}
                  to={`/agents/${pr.agentId}`}
                  variant="outlined"
                  startIcon={<SmartToyOutlinedIcon />}
                >
                  Open agent
                </Button>
              </ControlTooltip>
            ) : (
              <ControlTooltip
                title={
                  pr.workspaceId
                    ? 'Create a worktree and Claude agent for this pull request'
                    : 'Clone the repository and start a Claude agent for this pull request'
                }
                disabled={createAgent.isPending}
              >
                <Button
                  variant="outlined"
                  startIcon={
                    createAgent.isPending ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <SmartToyOutlinedIcon />
                    )
                  }
                  disabled={createAgent.isPending}
                  onClick={() => createAgent.mutate()}
                >
                  {pr.workspaceId ? 'Create agent' : 'Start agent'}
                </Button>
              </ControlTooltip>
            )}
            <ControlTooltip title="Open this pull request on GitHub">
              <Button
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                href={pr.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </Button>
            </ControlTooltip>
          </>
        }
      />

      {createAgent.error ? (
        <Alert severity="error">{(createAgent.error as Error).message}</Alert>
      ) : null}
      {startTemplate.error ? (
        <Alert severity="error">{(startTemplate.error as Error).message}</Alert>
      ) : null}

      {/*
        `behind` is only reported when the base branch requires strict status checks,
        so most repos never surface it — do not make "Update branch" always available
        to compensate, GitHub answers 422 when the branch is already up to date.
      */}
      <MergeReadinessPanel pr={pr} readiness={readiness} checks={checksQuery.data} />

      <MergeActions pr={pr} readiness={readiness} />

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, value: PrTab) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ px: { xs: 0.5, sm: 1.5 }, minHeight: 44, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="overview" label="Overview" />
          <Tab value="checks" label="Checks" />
          <Tab value="files" label={`Files (${pr.changedFiles})`} />
          <Tab value="commits" label={`Commits (${pr.commitCount})`} />
          <Tab value="reviews" label="Reviews" />
          <Tab value="conversation" label={`Conversation (${pr.commentCount})`} />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {tab === 'overview' && <PullRequestOverviewTab pr={pr} />}
          {tab === 'checks' && (
            <PullRequestChecksTab
              checks={checksQuery.data}
              loading={checksQuery.isLoading}
              error={checksQuery.error}
              onFixCi={
                pr.state === 'open' && !pr.merged
                  ? () => startTemplate.mutate('fix-ci')
                  : undefined
              }
              fixing={startTemplate.isPending}
            />
          )}
          {tab === 'files' && (
            <PullRequestFilesTab
              files={filesQuery.data}
              loading={filesQuery.isLoading}
              error={filesQuery.error}
            />
          )}
          {tab === 'commits' && (
            <PullRequestCommitsTab
              commits={commitsQuery.data}
              loading={commitsQuery.isLoading}
              error={commitsQuery.error}
            />
          )}
          {tab === 'reviews' && (
            <PullRequestReviewsTab
              reviews={reviewsQuery.data}
              loading={reviewsQuery.isLoading}
              error={reviewsQuery.error}
              canWrite={pr.state === 'open' && !pr.merged}
              submitting={submitReview.isPending}
              submitError={submitReview.error ? (submitReview.error as Error).message : null}
              onSubmitReview={(event, body) => submitReview.mutate({ event, body })}
            />
          )}
          {tab === 'conversation' && (
            <PullRequestConversationTab
              comments={commentsQuery.data}
              loading={commentsQuery.isLoading}
              error={commentsQuery.error}
              canWrite={pr.state === 'open' && !pr.merged}
              submitting={submitComment.isPending}
              submitError={submitComment.error ? (submitComment.error as Error).message : null}
              onSubmitComment={(body) => submitComment.mutate(body)}
            />
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
