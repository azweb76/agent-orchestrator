import { useQuery } from '@tanstack/react-query';
import type { AgentDetail } from '@agent-orchestrator/shared';
import { api } from '../../api/client';

/** Shared PR + checks queries for the agent page strip and action offers. */
export function useAgentLinkedPr(agent: Pick<AgentDetail, 'worktree' | 'workspace'>) {
  const prNumber = agent.worktree.prNumber;
  const owner = agent.workspace.githubOwner;
  const repo = agent.workspace.githubRepo;
  const enabled = prNumber != null && prNumber > 0;
  const prKey = ['pr', owner, repo, prNumber] as const;

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

  return {
    enabled,
    owner,
    repo,
    prNumber,
    prKey,
    prQuery,
    checksQuery,
    pr: prQuery.data,
    checks: checksQuery.data,
  };
}
