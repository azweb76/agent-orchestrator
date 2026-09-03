import type { EffortLevel, PermissionMode } from './entities.js';

export interface JiraIssue {
  key: string;
  id: string;
  summary: string;
  description: string;
  status: string;
  issueType: string;
  projectKey: string;
  projectName: string;
  htmlUrl: string;
  reporterDisplayName: string;
  updatedAt: string;
}

export interface JiraIssueComment {
  id: string;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
}

export interface JiraIssueDetail extends JiraIssue {
  comments: JiraIssueComment[];
}

export interface InboxJiraIssue {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  projectKey: string;
  projectName: string;
  htmlUrl: string;
  reporterDisplayName: string;
  updatedAt: string;
}

export interface JiraIssueInbox {
  assigned: InboxJiraIssue[];
}

export interface CreateAgentFromJiraIssueRequest {
  workspaceId: string;
  issueKey: string;
  name?: string;
}

export interface CreateWorktreeFromJiraIssueRequest {
  issueKey: string;
  name?: string;
  baseBranch?: string;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
}
