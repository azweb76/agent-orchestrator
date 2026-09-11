import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { PullRequestDetailTab } from './prDetailTab';

export function pullRequestQueryKey(owner: string, repo: string, prNumber: number) {
  return ['pr', owner, repo, prNumber] as const;
}

/** PR, checks, reviews, and lazy files/commits/comments for the detail body. */
export function usePullRequestDetail(input: {
  owner: string;
  repo: string;
  prNumber: number;
  tab: PullRequestDetailTab;
  enabled?: boolean;
}) {
  const { owner, repo, prNumber, tab, enabled = true } = input;
  const queryClient = useQueryClient();
  const prKey = pullRequestQueryKey(owner, repo, prNumber);
  const ready = enabled && prNumber > 0;

  const prQuery = useQuery({
    queryKey: prKey,
    queryFn: () => api.getPullRequest(owner, repo, prNumber),
    enabled: ready,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.merged || data.state !== 'open') return false;
      return data.mergeableState === 'unknown' ? 3000 : 15000;
    },
  });

  const checksQuery = useQuery({
    queryKey: [...prKey, 'checks'],
    queryFn: () => api.getPullRequestChecks(owner, repo, prNumber),
    enabled: ready,
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.checks.some((check) => check.status !== 'completed') ? 10_000 : false,
  });

  const reviewsQuery = useQuery({
    queryKey: [...prKey, 'reviews'],
    queryFn: () => api.getPullRequestReviews(owner, repo, prNumber),
    enabled: ready,
    staleTime: 30_000,
  });

  const filesQuery = useQuery({
    queryKey: [...prKey, 'files'],
    queryFn: () => api.getPullRequestFiles(owner, repo, prNumber),
    enabled: ready && tab === 'files',
    staleTime: 30_000,
  });

  const commitsQuery = useQuery({
    queryKey: [...prKey, 'commits'],
    queryFn: () => api.getPullRequestCommits(owner, repo, prNumber),
    enabled: ready && tab === 'commits',
    staleTime: 30_000,
  });

  const commentsQuery = useQuery({
    queryKey: [...prKey, 'comments'],
    queryFn: () => api.getPullRequestComments(owner, repo, prNumber),
    enabled: ready && tab === 'conversation',
    staleTime: 30_000,
  });

  const submitReview = useMutation({
    mutationFn: (payload: { event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body: string }) =>
      api.submitPullRequestReview(owner, repo, prNumber, {
        event: payload.event,
        body: payload.body || undefined,
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

  return {
    prKey,
    prQuery,
    checksQuery,
    reviewsQuery,
    filesQuery,
    commitsQuery,
    commentsQuery,
    submitReview,
    submitComment,
    pr: prQuery.data,
    checks: checksQuery.data,
  };
}
