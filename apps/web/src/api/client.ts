import type {
  Agent,
  AgentDetail,
  AgentDiff,
  AgentEvent,
  AllowPermissionRequest,
  AnswerAskUserQuestionRequest,
  ArchiveAgentRequest,
  ArchiveAgentResponse,
  BuildPlanRequest,
  ChatSession,
  CreateAgentFromPrRequest,
  CreateChatSessionRequest,
  CreatePrRequest,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromIdeaRequest,
  CreateWorktreeFromPrRequest,
  CreateWorkspaceRequest,
  DenyPermissionRequest,
  GenerateInstructionDraftRequest,
  ApplyInstructionFileRequest,
  ApplyInstructionFileResponse,
  GradeChatSessionRequest,
  GitHubBranch,
  GitHubRepository,
  WorkspacePullRequestList,
  InstructionDraft,
  InstructionFile,
  MergePullRequestRequest,
  MergePullRequestResponse,
  Message,
  PermissionRequest,
  PruneArchivedAgentsResponse,
  PullRequestChecks,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetail,
  PullRequestFiles,
  PullRequestInbox,
  PullRequestReview,
  QueuedChatMessage,
  EnqueueChatMessageRequest,
  RewindChatResponse,
  SessionContextUsage,
  SidebarWorkspace,
  SlashCommand,
  SuggestBranchNameResponse,
  UpdateAgentRequest,
  UpdateChatSessionRequest,
  UpdatePullRequestBranchRequest,
  UpdatePullRequestBranchResponse,
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

const prBase = (owner: string, repo: string, prNumber: number) =>
  `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`;

export interface SystemStatus {
  claudeInstalled: boolean;
  claudeBin: string;
  githubTokenConfigured: boolean;
  archivedAgentCount: number;
}

export const api = {
  getStatus: () => request<SystemStatus>('/status'),
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
  createWorktreeFromIdea: (workspaceId: string, body: CreateWorktreeFromIdeaRequest) =>
    request<{ worktree: WorktreeWithAgent; agent: Agent; branchName: string; idea: string }>(
      `/workspaces/${workspaceId}/worktrees/from-idea`,
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
  listPullRequests: (workspaceId: string, query = '') => {
    const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    return request<WorkspacePullRequestList>(`/workspaces/${workspaceId}/github/pulls${suffix}`);
  },
  searchRepositories: (query: string) =>
    request<GitHubRepository[]>(`/github/repos/search?q=${encodeURIComponent(query)}`),
  getPullRequestInbox: () => request<PullRequestInbox>('/github/pulls/inbox'),
  createAgentFromPr: (body: CreateAgentFromPrRequest) =>
    request<{ workspace: Workspace; worktree: Worktree; agent: Agent; created: boolean }>(
      '/github/pulls/create-agent',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  getPullRequest: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestDetail>(prBase(owner, repo, prNumber)),
  getPullRequestChecks: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestChecks>(`${prBase(owner, repo, prNumber)}/checks`),
  getPullRequestReviews: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestReview[]>(`${prBase(owner, repo, prNumber)}/reviews`),
  getPullRequestFiles: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestFiles>(`${prBase(owner, repo, prNumber)}/files`),
  getPullRequestCommits: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestCommit[]>(`${prBase(owner, repo, prNumber)}/commits`),
  getPullRequestComments: (owner: string, repo: string, prNumber: number) =>
    request<PullRequestComment[]>(`${prBase(owner, repo, prNumber)}/comments`),
  mergePullRequest: (
    owner: string,
    repo: string,
    prNumber: number,
    body: MergePullRequestRequest,
  ) =>
    request<MergePullRequestResponse>(`${prBase(owner, repo, prNumber)}/merge`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePullRequestBranch: (
    owner: string,
    repo: string,
    prNumber: number,
    body: UpdatePullRequestBranchRequest,
  ) =>
    request<UpdatePullRequestBranchResponse>(`${prBase(owner, repo, prNumber)}/update-branch`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setPullRequestState: (owner: string, repo: string, prNumber: number, state: 'open' | 'closed') =>
    request<PullRequestDetail>(`${prBase(owner, repo, prNumber)}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ state }),
    }),
  getAgent: (agentId: string) => request<AgentDetail>(`/agents/${agentId}`),
  updateAgent: (agentId: string, body: UpdateAgentRequest) =>
    request<Agent>(`/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  stopAgent: (agentId: string) =>
    request<Agent>(`/agents/${agentId}/stop`, { method: 'POST' }),
  archiveAgent: (agentId: string, body: ArchiveAgentRequest = {}) =>
    request<ArchiveAgentResponse>(`/agents/${agentId}/archive`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  pruneArchivedAgents: () =>
    request<PruneArchivedAgentsResponse>('/agents/prune-archived', { method: 'POST' }),
  listSessions: (agentId: string) => request<ChatSession[]>(`/agents/${agentId}/sessions`),
  createSession: (agentId: string, body: CreateChatSessionRequest = {}) =>
    request<{ session: ChatSession; kickoffPrompt: string | null }>(
      `/agents/${agentId}/sessions`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  updateSession: (agentId: string, sessionId: string, body: UpdateChatSessionRequest) =>
    request<ChatSession>(`/agents/${agentId}/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteSession: (agentId: string, sessionId: string) =>
    request<AgentDetail>(`/agents/${agentId}/sessions/${sessionId}`, { method: 'DELETE' }),
  activateSession: (agentId: string, sessionId: string) =>
    request<AgentDetail>(`/agents/${agentId}/sessions/${sessionId}/activate`, { method: 'POST' }),
  stopSession: (agentId: string, sessionId: string) =>
    request<Agent>(`/agents/${agentId}/sessions/${sessionId}/stop`, { method: 'POST' }),
  gradeSession: (agentId: string, sessionId: string, body: GradeChatSessionRequest) =>
    request<ChatSession>(`/agents/${agentId}/sessions/${sessionId}/grade`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  listInstructionFiles: (agentId: string) =>
    request<InstructionFile[]>(`/agents/${agentId}/instruction-files`),
  generateInstructionDraft: (
    agentId: string,
    sessionId: string,
    body: GenerateInstructionDraftRequest,
  ) =>
    request<InstructionDraft>(`/agents/${agentId}/sessions/${sessionId}/instruction-drafts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  applyInstructionFile: (agentId: string, body: ApplyInstructionFileRequest) =>
    request<ApplyInstructionFileResponse>(`/agents/${agentId}/instruction-files`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getMessages: (agentId: string, sessionId: string) =>
    request<Message[]>(`/agents/${agentId}/sessions/${sessionId}/messages`),
  getSessionContext: (agentId: string, sessionId: string) =>
    request<SessionContextUsage>(`/agents/${agentId}/sessions/${sessionId}/context`),
  clearMessages: (agentId: string, sessionId: string) =>
    request<{ cleared: number }>(`/agents/${agentId}/sessions/${sessionId}/messages`, {
      method: 'DELETE',
    }),
  rewindMessages: (agentId: string, sessionId: string, messageId: string) =>
    request<RewindChatResponse>(`/agents/${agentId}/sessions/${sessionId}/messages/rewind`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    }),
  listQueuedMessages: (agentId: string, sessionId: string) =>
    request<QueuedChatMessage[]>(`/agents/${agentId}/sessions/${sessionId}/queue`),
  enqueueMessage: (agentId: string, sessionId: string, body: EnqueueChatMessageRequest) =>
    request<QueuedChatMessage>(`/agents/${agentId}/sessions/${sessionId}/queue`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeQueuedMessage: (agentId: string, sessionId: string, queuedId: string) =>
    request<{ removed: boolean }>(`/agents/${agentId}/sessions/${sessionId}/queue/${queuedId}`, {
      method: 'DELETE',
    }),
  getEvents: (agentId: string) => request<AgentEvent[]>(`/agents/${agentId}/events`),
  getDiff: (agentId: string, scope: 'pending' | 'pr' = 'pending') =>
    request<AgentDiff>(`/agents/${agentId}/diff?scope=${encodeURIComponent(scope)}`),
  listSlashCommands: (agentId: string) =>
    request<SlashCommand[]>(`/agents/${agentId}/slash-commands`),
  listPendingPermissions: (agentId: string, sessionId: string) =>
    request<PermissionRequest[]>(`/agents/${agentId}/sessions/${sessionId}/permissions`),
  answerPermission: (agentId: string, sessionId: string, body: AnswerAskUserQuestionRequest) =>
    request<{ ok: true }>(`/agents/${agentId}/sessions/${sessionId}/permissions/answer`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  allowPermission: (agentId: string, sessionId: string, body: AllowPermissionRequest) =>
    request<{ ok: true }>(`/agents/${agentId}/sessions/${sessionId}/permissions/allow`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  denyPermission: (agentId: string, sessionId: string, body: DenyPermissionRequest) =>
    request<{ ok: true }>(`/agents/${agentId}/sessions/${sessionId}/permissions/deny`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createPr: (agentId: string, body: CreatePrRequest) =>
    request<{ number: number; htmlUrl: string }>(`/agents/${agentId}/create-pr`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export interface ChatStreamHandlers {
  onToken: (text: string) => void;
  onEvent: (event: Record<string, unknown>) => void;
  onPermissionRequest?: (request: PermissionRequest) => void;
  onUserMessage?: (message: Message) => void;
  onAssistantMessage?: (message: Message) => void;
  onSession?: (session: ChatSession) => void;
  onDone: (payload: { message: Message; sessionId: string | null; chatSessionId?: string }) => void;
  onError: (message: string) => void;
}

export interface StreamChatOptions {
  message: string;
  force?: boolean;
  images?: Array<{ name: string; mimeType: string; dataBase64: string }>;
}

async function consumeChatSse(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<void> {
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
      } else if (eventType === 'permission_request') {
        handlers.onPermissionRequest?.(data as unknown as PermissionRequest);
      } else if (eventType === 'user_message') {
        handlers.onUserMessage?.(data as unknown as Message);
      } else if (eventType === 'assistant_message') {
        handlers.onAssistantMessage?.(data as unknown as Message);
      } else if (eventType === 'session') {
        handlers.onSession?.(data as unknown as ChatSession);
      } else if (eventType === 'done') {
        handlers.onDone(data as { message: Message; sessionId: string | null; chatSessionId?: string });
      } else if (eventType === 'error') {
        handlers.onError(String(data.message ?? 'Unknown error'));
      }
    }
  }
}

export async function streamChat(
  agentId: string,
  sessionId: string,
  options: StreamChatOptions,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${agentId}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: options.message,
      force: options.force,
      images: options.images,
    }),
    signal,
  });

  await consumeChatSse(response, handlers);
}

/** Stash the plan session, create a Build session, and stream implementation. */
export async function streamBuildPlan(
  agentId: string,
  sessionId: string,
  body: BuildPlanRequest,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/agents/${agentId}/sessions/${sessionId}/permissions/build`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  );

  await consumeChatSse(response, handlers);
}
