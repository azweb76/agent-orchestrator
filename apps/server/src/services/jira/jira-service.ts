import type { JiraIssue, JiraIssueComment, JiraIssueDetail } from '@agent-orchestrator/shared';
import {
  createJiraClientContext,
  isJiraConfigured,
  resetJiraCaches,
  type JiraApiOptions,
  type JiraClientContext,
} from './client.js';
import {
  getAuthenticatedDisplayName,
  getIssue,
  getIssueDetail,
  listAssignedOpenIssues,
  listIssueComments,
} from './issues.js';

export class JiraService {
  private ctx: JiraClientContext;

  constructor(options: JiraApiOptions = {}) {
    this.ctx = createJiraClientContext(options);
  }

  isConfigured(): boolean {
    return isJiraConfigured(this.ctx.options);
  }

  setCredentials(options: JiraApiOptions): void {
    this.ctx.options = {
      baseUrl: options.baseUrl?.trim() || this.ctx.options.baseUrl,
      email: options.email?.trim() || this.ctx.options.email,
      apiToken: options.apiToken?.trim() || this.ctx.options.apiToken,
    };
    resetJiraCaches(this.ctx);
  }

  getAuthenticatedDisplayName(): Promise<string> {
    return getAuthenticatedDisplayName(this.ctx);
  }

  listAssignedOpenIssues(): Promise<JiraIssue[]> {
    return listAssignedOpenIssues(this.ctx);
  }

  getIssue(issueKey: string): Promise<JiraIssue> {
    return getIssue(this.ctx, issueKey);
  }

  listIssueComments(issueKey: string): Promise<JiraIssueComment[]> {
    return listIssueComments(this.ctx, issueKey);
  }

  getIssueDetail(issueKey: string): Promise<JiraIssueDetail> {
    return getIssueDetail(this.ctx, issueKey);
  }
}
