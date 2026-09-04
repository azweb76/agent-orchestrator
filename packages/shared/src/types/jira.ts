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
  /** Best-effort local workspace for this Jira project, if any. */
  suggestedWorkspaceId: string | null;
}

export interface JiraIssueInbox {
  assigned: InboxJiraIssue[];
}

export interface CreateAgentFromJiraIssueRequest {
  /**
   * Target workspace. When omitted, the server uses the remembered project map
   * or a heuristic match against cloned workspaces.
   */
  workspaceId?: string;
  issueKey: string;
  name?: string;
}

export interface CreateWorktreeFromJiraIssueRequest {
  issueKey: string;
  name?: string;
  /**
   * Git branch / worktree name. Omit, empty, or `"auto"` to suggest from the issue.
   */
  branch?: string;
  baseBranch?: string;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  /** Reset the suggested branch if it already exists locally. */
  overwrite?: boolean;
}
