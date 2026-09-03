import type {
  Agent,
  CreateAgentFromJiraIssueRequest,
  JiraIssueInbox,
  Worktree,
  Workspace,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiJira = {
  getJiraIssueInbox: () => request<JiraIssueInbox>('/jira/issues/inbox'),
  createAgentFromJiraIssue: (body: CreateAgentFromJiraIssueRequest) =>
    request<{
      workspace: Workspace;
      worktree: Worktree;
      agent: Agent;
      prompt: string;
      issueKey: string;
      created: boolean;
    }>('/jira/issues/create-agent', { method: 'POST', body: JSON.stringify(body) }),
};
