import { useState } from 'react';
import { useParams } from 'react-router-dom';
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
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildPrCreateAgentPrompt,
  buildPrTemplatePrompt,
  evaluateMergeReadiness,
} from '@agent-orchestrator/shared';
import type { ChatSessionTemplateId } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { useSendAssistantPrompt } from '../components/dashboard/useSendAssistantPrompt';
import { MergeActions } from '../components/pr/MergeActions';
import { MergeReadinessPanel } from '../components/pr/MergeReadinessPanel';
import { PullRequestChecksTab } from '../components/pr/PullRequestChecksTab';
import { PullRequestCommitsTab } from '../components/pr/PullRequestCommitsTab';
import { PullRequestConversationTab } from '../components/pr/PullRequestConversationTab';
import { PullRequestDetailActions } from '../components/pr/PullRequestDetailActions';
import { PullRequestFilesTab } from '../components/pr/PullRequestFilesTab';
import { PullRequestOverviewTab } from '../components/pr/PullRequestOverviewTab';
import { PullRequestReviewsTab } from '../components/pr/PullRequestReviewsTab';
import { PullRequestStatusChip } from '../components/pr/PullRequestStatusChip';
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

function PullRequestDetailContent({
  owner,
  repo,
  prNumber,
}: {
  owner: string;
  repo: string;
  prNumber: number;
}) {
  const queryClient = useQueryClient();
  const assistant = useSendAssistantPrompt();
  const [tab, setTab] = useState<PrTab>('overview');
  const [templatePending, setTemplatePending] = useState(false);

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

  const createAgent = async () => {
    await assistant.sendPrompt(
      buildPrCreateAgentPrompt({
        owner,
        repo,
        number: prNumber,
        agentId: prQuery.data?.agentId,
      }).prompt,
    );
  };

  const startTemplate = async (template: ChatSessionTemplateId) => {
    if (
      template !== 'fix-ci' &&
      template !== 'address-review' &&
      template !== 'resolve-conflicts'
    ) {
      return;
    }
    setTemplatePending(true);
    try {
      await assistant.sendPrompt(
        buildPrTemplatePrompt(
          {
            owner,
            repo,
            number: prNumber,
            agentId: prQuery.data?.agentId,
          },
          template,
        ).prompt,
      );
    } finally {
      setTemplatePending(false);
    }
  };

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
            <PullRequestStatusChip pr={pr} />
            {pr.archived ? <Chip size="small" label="Archived" color="warning" variant="outlined" /> : null}
          </Stack>
        }
        actions={
          <>
            <PullRequestDetailActions
              pr={pr}
              failingChecks={checksQuery.data?.failing ?? 0}
              createPending={assistant.sending && !templatePending}
              templatePending={templatePending}
              onCreateAgent={() => void createAgent()}
              onStartTemplate={(template) => void startTemplate(template)}
            />
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

      {assistant.error ? <Alert severity="error">{assistant.error}</Alert> : null}

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
                pr.state === 'open' && !pr.merged && !pr.archived
                  ? () => void startTemplate('fix-ci')
                  : undefined
              }
              fixing={templatePending}
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
              canWrite={pr.state === 'open' && !pr.merged && !pr.archived}
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
              canWrite={pr.state === 'open' && !pr.merged && !pr.archived}
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
