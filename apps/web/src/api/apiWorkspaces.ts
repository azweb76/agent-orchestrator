import type {
  Agent,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromGoalRequest,
  CreateWorktreeFromIssueRequest,
  CreateWorktreeFromJiraIssueRequest,
  CreateWorktreeFromPrRequest,
  CreateWorkspaceRequest,
  GitHubBranch,
  SidebarWorkspace,
  Workspace,
  WorkspacePullRequestList,
  WorkspaceWithCounts,
  WorktreeFileEntry,
  WorktreeWithAgent,
  WorkspaceSyncStatus,
  WorkspaceAiReadiness,
  WorkspaceAiReadinessCache,
  CreateAiReadinessAgentRequest,
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
  listWorkspaceMentionFiles: (workspaceId: string) =>
    request<WorktreeFileEntry[]>(`/workspaces/${workspaceId}/mention-files`),
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
  createWorktreeFromJiraIssue: (workspaceId: string, body: CreateWorktreeFromJiraIssueRequest) =>
    request<{ worktree: WorktreeWithAgent; agent: Agent; branchName: string; issueKey: string; prompt: string }>(
      `/workspaces/${workspaceId}/worktrees/from-jira`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  deleteWorktree: (worktreeId: string) =>
    request<void>(`/worktrees/${worktreeId}`, { method: 'DELETE' }),
  listBranches: (workspaceId: string) =>
    request<GitHubBranch[]>(`/workspaces/${workspaceId}/github/branches`),

  getSyncStatus: (workspaceId: string) =>
    request<WorkspaceSyncStatus>(`/workspaces/${workspaceId}/sync-status`),
  pullDefaultBranch: (workspaceId: string) =>
    request<WorkspaceSyncStatus>(`/workspaces/${workspaceId}/pull`, { method: 'POST' }),
  getAiReadiness: (workspaceId: string) =>
    request<WorkspaceAiReadinessCache>(`/workspaces/${workspaceId}/ai-readiness`),
  analyzeAiReadiness: (workspaceId: string) =>
    request<WorkspaceAiReadiness>(`/workspaces/${workspaceId}/ai-readiness/analyze`, {
      method: 'POST',
    }),
  createAiReadinessAgent: (workspaceId: string, body: CreateAiReadinessAgentRequest = {}) =>
    request<{
      worktree: WorktreeWithAgent;
      agent: Agent;
      branchName: string;
      goal: string;
      kickoffPrompt: string;
      task: unknown;
      readiness: WorkspaceAiReadiness;
    }>(`/workspaces/${workspaceId}/ai-readiness/implement`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listPullRequests: (workspaceId: string, query = '') => {
    const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    return request<WorkspacePullRequestList>(`/workspaces/${workspaceId}/github/pulls${suffix}`);
  },
};
