import { Box, Paper, Stack, Tab, Tabs } from '@mui/material';
import { evaluateMergeReadiness, type PullRequestDetail } from '@agent-orchestrator/shared';
import { MergeActions } from './MergeActions';
import { MergeReadinessPanel } from './MergeReadinessPanel';
import { PrFixButton } from './PrFixButton';
import { PullRequestChecksTab } from './PullRequestChecksTab';
import { PullRequestCommitsTab } from './PullRequestCommitsTab';
import { PullRequestConversationTab } from './PullRequestConversationTab';
import { PullRequestFilesTab } from './PullRequestFilesTab';
import { PullRequestOverviewTab } from './PullRequestOverviewTab';
import { PullRequestReviewsTab } from './PullRequestReviewsTab';
import type { PullRequestDetailTab } from './prDetailTab';
import type { PrFixCopySource, PrKickoffTemplate } from './prFixCopy';
import type { usePullRequestDetail } from './usePullRequestDetail';

type DetailQueries = ReturnType<typeof usePullRequestDetail>;

export interface PullRequestDetailSectionsProps {
  pr: PullRequestDetail;
  detail: DetailQueries;
  tab: PullRequestDetailTab;
  onTabChange: (tab: PullRequestDetailTab) => void;
  kickoffs?: readonly PrKickoffTemplate[];
  onStartKickoff?: (template: PrKickoffTemplate) => void;
  kickoffPending?: boolean;
  fixCopy: PrFixCopySource;
  canWrite: boolean;
}

function kickoffOn(
  kickoffs: readonly PrKickoffTemplate[] | undefined,
  template: PrKickoffTemplate,
  onStart?: (template: PrKickoffTemplate) => void,
): (() => void) | undefined {
  if (!onStart || !kickoffs?.includes(template)) return undefined;
  return () => onStart(template);
}

export function PullRequestDetailSections({
  pr,
  detail,
  tab,
  onTabChange,
  kickoffs = [],
  onStartKickoff,
  kickoffPending,
  fixCopy,
  canWrite,
}: PullRequestDetailSectionsProps) {
  const readiness = evaluateMergeReadiness(pr);
  const onFixCi = kickoffOn(kickoffs, 'fix-ci', onStartKickoff);
  const onFixConflicts = kickoffOn(kickoffs, 'resolve-conflicts', onStartKickoff);
  const onFixReview = kickoffOn(kickoffs, 'address-review', onStartKickoff);
  const readinessFixes =
    onFixConflicts || onFixCi || onFixReview ? (
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {onFixConflicts ? (
          <PrFixButton
            template="resolve-conflicts"
            source={fixCopy}
            pending={kickoffPending}
            onClick={onFixConflicts}
          />
        ) : null}
        {onFixCi ? (
          <PrFixButton template="fix-ci" source={fixCopy} pending={kickoffPending} onClick={onFixCi} />
        ) : null}
        {onFixReview ? (
          <PrFixButton
            template="address-review"
            source={fixCopy}
            pending={kickoffPending}
            onClick={onFixReview}
          />
        ) : null}
      </Stack>
    ) : undefined;

  return (
    <Stack spacing={2} sx={{ minHeight: 0 }}>
      {/*
        `behind` is only reported when the base branch requires strict status checks,
        so most repos never surface it — do not make "Update branch" always available
        to compensate, GitHub answers 422 when the branch is already up to date.
      */}
      <MergeReadinessPanel
        pr={pr}
        readiness={readiness}
        checks={detail.checksQuery.data}
        action={readinessFixes}
      />

      <MergeActions pr={pr} readiness={readiness} />

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, value: PullRequestDetailTab) => onTabChange(value)}
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
              checks={detail.checksQuery.data}
              loading={detail.checksQuery.isLoading}
              error={detail.checksQuery.error}
              onFixCi={onFixCi}
              fixing={kickoffPending}
              fixCopy={fixCopy}
            />
          )}
          {tab === 'files' && (
            <PullRequestFilesTab
              files={detail.filesQuery.data}
              loading={detail.filesQuery.isLoading}
              error={detail.filesQuery.error}
            />
          )}
          {tab === 'commits' && (
            <PullRequestCommitsTab
              commits={detail.commitsQuery.data}
              loading={detail.commitsQuery.isLoading}
              error={detail.commitsQuery.error}
            />
          )}
          {tab === 'reviews' && (
            <PullRequestReviewsTab
              reviews={detail.reviewsQuery.data}
              loading={detail.reviewsQuery.isLoading}
              error={detail.reviewsQuery.error}
              canWrite={canWrite}
              submitting={detail.submitReview.isPending}
              submitError={detail.submitReview.error ? detail.submitReview.error.message : null}
              onSubmitReview={(event, body) => detail.submitReview.mutate({ event, body })}
              onFixReview={onFixReview}
              fixing={kickoffPending}
              fixCopy={fixCopy}
            />
          )}
          {tab === 'conversation' && (
            <PullRequestConversationTab
              comments={detail.commentsQuery.data}
              loading={detail.commentsQuery.isLoading}
              error={detail.commentsQuery.error}
              canWrite={canWrite}
              submitting={detail.submitComment.isPending}
              submitError={detail.submitComment.error ? detail.submitComment.error.message : null}
              onSubmitComment={(body) => detail.submitComment.mutate(body)}
            />
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
