import { useState } from 'react';
import { Alert, Avatar, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { PullRequestComment } from '@agent-orchestrator/shared';
import { MarkdownContent } from '../chat/MarkdownContent';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { ListPanel, ListRow, ListRowTitle } from '../ui/ListPanel';
import { formatRelativeTime } from '../../utils/format';
import { TabState } from './TabState';

export interface PullRequestConversationTabProps {
  comments?: PullRequestComment[];
  loading: boolean;
  error: unknown;
  canWrite?: boolean;
  submitting?: boolean;
  submitError?: string | null;
  onSubmitComment?: (body: string) => void;
}

export function PullRequestConversationTab({
  comments,
  loading,
  error,
  canWrite,
  submitting,
  submitError,
  onSubmitComment,
}: PullRequestConversationTabProps) {
  const [body, setBody] = useState('');

  return (
    <Stack spacing={2}>
    <TabState
      loading={loading}
      error={error}
      isEmpty={!comments || comments.length === 0}
      empty={
        <EmptyState
          compact
          title="No comments"
          description="Issue comments on this pull request will appear here. Review comments live on the Reviews tab."
        />
      }
    >
      <ListPanel>
        {comments?.map((comment) => (
          <ListRow key={comment.id}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar src={comment.author?.avatarUrl ?? undefined} sx={{ width: 24, height: 24 }}>
                {comment.author?.login.slice(0, 1).toUpperCase() ?? '?'}
              </Avatar>
              <ListRowTitle>{comment.author?.login ?? 'Unknown author'}</ListRowTitle>
              <Typography variant="caption" color="text.secondary">
                {formatRelativeTime(comment.createdAt)}
              </Typography>
            </Stack>
            <Box sx={{ mt: 0.75, overflowWrap: 'anywhere' }}>
              <MarkdownContent content={comment.body} />
            </Box>
            {comment.htmlUrl ? (
              <Box sx={{ mt: 0.5 }}>
                <Link
                  href={comment.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  variant="body2"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                >
                  View comment <OpenInNewIcon sx={{ fontSize: 14 }} />
                </Link>
              </Box>
            ) : null}
          </ListRow>
        ))}
      </ListPanel>
    </TabState>

      {canWrite && onSubmitComment ? (
        <Stack spacing={1.25}>
          <Typography variant="subtitle2">Add a comment</Typography>
          <ControlTooltip title="Leave a conversation comment on this pull request">
            <TextField
              label="Comment"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              fullWidth
              multiline
              minRows={3}
              placeholder="Leave a conversation comment on this pull request"
            />
          </ControlTooltip>
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}
          <Box>
            <ControlTooltip title="Post comment" disabled={submitting || !body.trim()}>
              <Button
                variant="contained"
                disabled={submitting || !body.trim()}
                onClick={() => {
                  onSubmitComment(body.trim());
                  setBody('');
                }}
              >
                {submitting ? 'Posting…' : 'Comment'}
              </Button>
            </ControlTooltip>
          </Box>
        </Stack>
      ) : null}
    </Stack>
  );
}
