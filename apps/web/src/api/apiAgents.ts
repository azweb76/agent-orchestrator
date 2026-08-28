import type {
  Agent,
  AgentDetail,
  AgentDiff,
  AllowPermissionRequest,
  AnswerAskUserQuestionRequest,
  ArchiveAgentRequest,
  ArchiveAgentResponse,
  ChatSession,
  CommitAgentChangesRequest,
  CommitAgentChangesResponse,
  CreateChatSessionRequest,
  CreatePrRequest,
  DenyPermissionRequest,
  EnqueueChatMessageRequest,
  GenerateInstructionDraftRequest,
  ApplyInstructionFileRequest,
  ApplyInstructionFileResponse,
  GradeChatSessionRequest,
  InstructionDraft,
  InstructionFile,
  Message,
  PermissionRequest,
  PruneArchivedAgentsResponse,
  QueuedChatMessage,
  RewindChatResponse,
  SessionContextUsage,
  SessionSearchHit,
  SlashCommand,
  UpdateChatSessionRequest,
  UpdateAgentRequest,
  WorktreeFileEntry,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiAgents = {
  getAgent: (agentId: string) => request<AgentDetail>(`/agents/${agentId}`),
  updateAgent: (agentId: string, body: UpdateAgentRequest) =>
    request<AgentDetail>(`/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  archiveAgent: (agentId: string, body: ArchiveAgentRequest = {}) =>
    request<ArchiveAgentResponse>(`/agents/${agentId}/archive`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  unarchiveAgent: (agentId: string) =>
    request<Agent>(`/agents/${agentId}/unarchive`, { method: 'POST' }),
  pruneArchivedAgents: () =>
    request<PruneArchivedAgentsResponse>('/agents/prune-archived', { method: 'POST' }),
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
  getDiff: (agentId: string, scope: 'pending' | 'pr' = 'pending') =>
    request<AgentDiff>(`/agents/${agentId}/diff?scope=${encodeURIComponent(scope)}`),
  listSlashCommands: (agentId: string) =>
    request<SlashCommand[]>(`/agents/${agentId}/slash-commands`),
  listMentionFiles: (agentId: string) =>
    request<WorktreeFileEntry[]>(`/agents/${agentId}/mention-files`),
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
  commitChanges: (agentId: string, body: CommitAgentChangesRequest) =>
    request<CommitAgentChangesResponse>(`/agents/${agentId}/commit`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  searchSessions: (query: string, limit = 24) =>
    request<SessionSearchHit[]>(
      `/sessions/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ),
};
