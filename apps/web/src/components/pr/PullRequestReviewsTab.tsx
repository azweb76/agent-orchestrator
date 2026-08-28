import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { PullRequestReview, PullRequestReviewEvent } from '@agent-orchestrator/shared';
import { MarkdownContent } from '../chat/MarkdownContent';
import { ControlTooltip } from '../ui/ControlTooltip';
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
  canWrite?: boolean;
  submitting?: boolean;
  submitError?: string | null;
  onSubmitReview?: (event: PullRequestReviewEvent, body: string) => void;
}

export function PullRequestReviewsTab({
  reviews,
  loading,
  error,
  canWrite,
  submitting,
  submitError,
  onSubmitReview,
}: PullRequestReviewsTabProps) {
  const [event, setEvent] = useState<PullRequestReviewEvent>('COMMENT');
  const [body, setBody] = useState('');

  return (
    <Stack spacing={2}>
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

      {canWrite && onSubmitReview ? (
        <Stack spacing={1.25} sx={{ pt: 0.5 }}>
          <Typography variant="subtitle2">Submit a review</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <ControlTooltip title="Choose whether to comment, approve, or request changes">
              <FormControl size="small" sx={{ minWidth: { sm: 200 } }}>
                <InputLabel id="review-event-label">Action</InputLabel>
                <Select
                  labelId="review-event-label"
                  label="Action"
                  value={event}
                  onChange={(e) => setEvent(e.target.value as PullRequestReviewEvent)}
                >
                  <MenuItem value="COMMENT">Comment</MenuItem>
                  <MenuItem value="APPROVE">Approve</MenuItem>
                  <MenuItem value="REQUEST_CHANGES">Request changes</MenuItem>
                </Select>
              </FormControl>
            </ControlTooltip>
          </Stack>
          <ControlTooltip title="What should the author know?">
            <TextField
              label={event === 'APPROVE' ? 'Comment (optional)' : 'Comment'}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              fullWidth
              multiline
              minRows={3}
              placeholder="What should the author know?"
            />
          </ControlTooltip>
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}
          <Box>
            <ControlTooltip
              title="Submit review"
              disabled={submitting || (event !== 'APPROVE' && !body.trim())}
            >
              <Button
                variant="contained"
                disabled={submitting || (event !== 'APPROVE' && !body.trim())}
                onClick={() => {
                  onSubmitReview(event, body.trim());
                  setBody('');
                }}
              >
                {submitting ? 'Submitting…' : 'Submit review'}
              </Button>
            </ControlTooltip>
          </Box>
        </Stack>
      ) : null}
    </Stack>
  );
}
