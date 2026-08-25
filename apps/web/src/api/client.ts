import type {
  Agent,
  AgentDetail,
  AgentDiff,
  AgentEvent,
  CreateAgentFromPrRequest,
  CreatePrRequest,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromPrRequest,
  CreateWorkspaceRequest,
  GitHubBranch,
  GitHubPullRequest,
  GitHubRepository,
  Message,
  PullRequestInbox,
  SuggestBranchNameResponse,
  UpdateAgentRequest,
  Worktree,
  WorktreeWithAgent,
  Workspace,
  WorkspaceWithCounts,
} from '@agent-orchestrator/shared';

const API_BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface SystemStatus {
  claudeInstalled: boolean;
  claudeBin: string;
  githubTokenConfigured: boolean;
}

export const api = {
  getStatus: () => request<SystemStatus>('/status'),
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
  suggestBranchName: (workspaceId: string, idea: string) =>
    request<SuggestBranchNameResponse>(`/workspaces/${workspaceId}/worktrees/suggest-branch-name`, {
      method: 'POST',
      body: JSON.stringify({ idea }),
    }),
  createWorktreeFromPr: (workspaceId: string, body: CreateWorktreeFromPrRequest) =>
    request<{ worktree: WorktreeWithAgent; agent: Agent }>(
      `/workspaces/${workspaceId}/worktrees/from-pr`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  deleteWorktree: (worktreeId: string) =>
    request<void>(`/worktrees/${worktreeId}`, { method: 'DELETE' }),
  listBranches: (workspaceId: string) =>
    request<GitHubBranch[]>(`/workspaces/${workspaceId}/github/branches`),
  listPullRequests: (workspaceId: string) =>
    request<GitHubPullRequest[]>(`/workspaces/${workspaceId}/github/pulls`),
  searchRepositories: (query: string) =>
    request<GitHubRepository[]>(`/github/repos/search?q=${encodeURIComponent(query)}`),
  getPullRequestInbox: () => request<PullRequestInbox>('/github/pulls/inbox'),
  createAgentFromPr: (body: CreateAgentFromPrRequest) =>
    request<{ workspace: Workspace; worktree: Worktree; agent: Agent; created: boolean }>(
      '/github/pulls/create-agent',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  getAgent: (agentId: string) => request<AgentDetail>(`/agents/${agentId}`),
  updateAgent: (agentId: string, body: UpdateAgentRequest) =>
    request<Agent>(`/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  startAgent: (agentId: string) =>
    request<Agent>(`/agents/${agentId}/start`, { method: 'POST' }),
  stopAgent: (agentId: string) =>
    request<Agent>(`/agents/${agentId}/stop`, { method: 'POST' }),
  archiveAgent: (agentId: string) =>
    request<Agent>(`/agents/${agentId}/archive`, { method: 'POST' }),
  getMessages: (agentId: string) => request<Message[]>(`/agents/${agentId}/messages`),
  getEvents: (agentId: string) => request<AgentEvent[]>(`/agents/${agentId}/events`),
  getDiff: (agentId: string) => request<AgentDiff>(`/agents/${agentId}/diff`),
  createPr: (agentId: string, body: CreatePrRequest) =>
    request<{ number: number; htmlUrl: string }>(`/agents/${agentId}/create-pr`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export interface ChatStreamHandlers {
  onToken: (text: string) => void;
  onEvent: (event: Record<string, unknown>) => void;
  onDone: (payload: { message: Message; sessionId: string | null }) => void;
  onError: (message: string) => void;
}

export async function streamChat(
  agentId: string,
  message: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${agentId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Chat request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = 'message';
      let dataLine = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLine = line.slice(5).trim();
        }
      }

      if (!dataLine) continue;
      const data = JSON.parse(dataLine) as Record<string, unknown>;

      if (eventType === 'token') {
        handlers.onToken(String(data.text ?? ''));
      } else if (eventType === 'event') {
        handlers.onEvent(data);
      } else if (eventType === 'done') {
        handlers.onDone(data as { message: Message; sessionId: string | null });
      } else if (eventType === 'error') {
        handlers.onError(String(data.message ?? 'Unknown error'));
      }
    }
  }
}
