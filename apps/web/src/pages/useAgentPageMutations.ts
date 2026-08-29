import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { pullRequestPath } from '../utils/paths';

export function useAgentPageMutations(agentId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const archiveMutation = useMutation({
    mutationFn: (deleteWorktree: boolean) => api.archiveAgent(agentId, { deleteWorktree }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      if (result.deletedWorktree) {
        const detail = queryClient.getQueryData<{ workspace: { id: string } }>(['agent', agentId]);
        navigate(detail?.workspace.id ? `/workspaces/${detail.workspace.id}` : '/');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => api.unarchiveAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const commitMutation = useMutation({
    mutationFn: ({ message, push }: { message: string; push: boolean }) =>
      api.commitChanges(agentId, {
        ...(message ? { message } : {}),
        push,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });

  const createPrMutation = useMutation({
    mutationFn: ({ title, body, draft }: { title: string; body: string; draft: boolean }) =>
      api.createPr(agentId, { title, body, draft }),
    onSuccess: (pr) => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['diff', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
      const detail = queryClient.getQueryData<{
        workspace: { githubOwner: string; githubRepo: string };
      }>(['agent', agentId]);
      if (detail?.workspace) {
        navigate(pullRequestPath(detail.workspace.githubOwner, detail.workspace.githubRepo, pr.number));
      }
    },
  });

  const autopilotMutation = useMutation({
    mutationFn: (autopilot: boolean | null) => api.updateAgent(agentId, { autopilot }),
    onSuccess: (detail) => {
      queryClient.setQueryData(['agent', agentId], detail);
    },
  });

  return {
    archiveMutation,
    unarchiveMutation,
    commitMutation,
    createPrMutation,
    autopilotMutation,
  };
}
