import { Avatar, Box, Link, Stack, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { PullRequestComment } from '@agent-orchestrator/shared';
import { MarkdownContent } from '../chat/MarkdownContent';
import { EmptyState } from '../ui/EmptyState';
import { ListPanel, ListRow, ListRowTitle } from '../ui/ListPanel';
import { formatRelativeTime } from '../../utils/format';
import { TabState } from './TabState';

export interface PullRequestConversationTabProps {
  comments?: PullRequestComment[];
  loading: boolean;
  error: unknown;
}

export function PullRequestConversationTab({
  comments,
  loading,
  error,
}: PullRequestConversationTabProps) {
  return (
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
  );
}
