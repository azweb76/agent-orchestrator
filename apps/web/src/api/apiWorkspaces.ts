import type {
  Agent,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromGoalRequest,
  CreateWorktreeFromIssueRequest,
  CreateWorktreeFromPrRequest,
  CreateWorkspaceRequest,
  GitHubBranch,
  SidebarWorkspace,
  Workspace,
  WorkspacePullRequestList,
  WorkspaceWithCounts,
  WorktreeWithAgent,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiWorkspaces = {
  listSidebar: () => request<SidebarWorkspace[]>('/sidebar'),
  listWorkspaces: () => request<WorkspaceWithCounts[]>('/workspaces'),
  createWorkspace: (body: CreateWorkspaceRequest) =>
    request<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  getWorkspace: (id: string) => request<Workspace>(`/workspaces/${id}`),
  deleteWorkspace: (id: string) => request<void>(`/workspaces/${id}`, { method: 'DELETE' }),
  listWorktrees: (workspaceId: string) =>
    request<WorktreeWithAgent[]>(`/workspaces/${workspaceId}/worktrees`),
  createWorktreeFromBranch: (workspaceId: string, body: CreateWorktreeFromBranchRequest) =>
    request<{ worktree: WorktreeWithAgent; agent: Agent }>(
      `/workspaces/${workspaceId}/worktrees/from-branch`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  createWorktreeFromGoal: (workspaceId: string, body: CreateWorktreeFromGoalRequest) =>
    request<{
      worktree: WorktreeWithAgent;
      agent: Agent;
      branchName: string;
      goal: string;
      kickoffPrompt: string;
    }>(`/workspaces/${workspaceId}/worktrees/from-goal`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createWorktreeFromPr: (workspaceId: string, body: CreateWorktreeFromPrRequest) =>
    request<{ worktree: WorktreeWithAgent; agent: Agent }>(
      `/workspaces/${workspaceId}/worktrees/from-pr`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  createWorktreeFromIssue: (workspaceId: string, body: CreateWorktreeFromIssueRequest) =>
    request<{ worktree: WorktreeWithAgent; agent: Agent; branchName: string; issueNumber: number; prompt: string }>(
      `/workspaces/${workspaceId}/worktrees/from-issue`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  deleteWorktree: (worktreeId: string) =>
    request<void>(`/worktrees/${worktreeId}`, { method: 'DELETE' }),
  listBranches: (workspaceId: string) =>
    request<GitHubBranch[]>(`/workspaces/${workspaceId}/github/branches`),
  listPullRequests: (workspaceId: string, query = '') => {
    const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    return request<WorkspacePullRequestList>(`/workspaces/${workspaceId}/github/pulls${suffix}`);
  },
};
