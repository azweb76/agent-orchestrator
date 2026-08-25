import { Avatar, Box, Chip, Link, Stack, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { PullRequestReview } from '@agent-orchestrator/shared';
import { MarkdownContent } from '../chat/MarkdownContent';
import { EmptyState } from '../ui/EmptyState';
import { ListPanel, ListRow, ListRowTitle } from '../ui/ListPanel';
import { formatRelativeTime } from '../../utils/format';
import { TabState } from './TabState';

const STATE_COLORS: Record<string, 'success' | 'error' | 'info' | 'default'> = {
  APPROVED: 'success',
  CHANGES_REQUESTED: 'error',
  COMMENTED: 'info',
  DISMISSED: 'default',
  PENDING: 'default',
};

function stateLabel(state: string): string {
  return state.toLowerCase().replace(/_/g, ' ');
}

export interface PullRequestReviewsTabProps {
  reviews?: PullRequestReview[];
  loading: boolean;
  error: unknown;
}

export function PullRequestReviewsTab({ reviews, loading, error }: PullRequestReviewsTabProps) {
  return (
    <TabState
      loading={loading}
      error={error}
      isEmpty={!reviews || reviews.length === 0}
      empty={
        <EmptyState
          compact
          title="No reviews yet"
          description="Approvals and change requests will appear here."
        />
      }
    >
      <ListPanel>
        {reviews?.map((review) => (
          <ListRow key={review.id}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar src={review.author?.avatarUrl ?? undefined} sx={{ width: 24, height: 24 }}>
                {review.author?.login.slice(0, 1).toUpperCase() ?? '?'}
              </Avatar>
              <ListRowTitle>{review.author?.login ?? 'Unknown reviewer'}</ListRowTitle>
              <Chip
                size="small"
                variant="outlined"
                color={STATE_COLORS[review.state] ?? 'default'}
                label={stateLabel(review.state)}
              />
              {review.submittedAt ? (
                <Typography variant="caption" color="text.secondary">
                  {formatRelativeTime(review.submittedAt)}
                </Typography>
              ) : null}
            </Stack>
            {review.body?.trim() ? (
              <Box sx={{ mt: 0.75, overflowWrap: 'anywhere' }}>
                <MarkdownContent content={review.body} />
              </Box>
            ) : null}
            {review.htmlUrl ? (
              <Box sx={{ mt: 0.5 }}>
                <Link
                  href={review.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  variant="body2"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                >
                  View review <OpenInNewIcon sx={{ fontSize: 14 }} />
                </Link>
              </Box>
            ) : null}
          </ListRow>
        ))}
      </ListPanel>
    </TabState>
  );
}
