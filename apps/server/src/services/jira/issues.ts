import type { JiraIssue, JiraIssueComment, JiraIssueDetail } from '@agent-orchestrator/shared';
import { normalizeDescription } from './adf.js';
import type { JiraClientContext } from './client.js';
import { request, requireJiraConfig } from './client.js';

interface RawJiraUser {
  displayName?: string;
  emailAddress?: string;
}

interface RawJiraIssueFields {
  summary?: string;
  description?: unknown;
  status?: { name?: string };
  issuetype?: { name?: string };
  project?: { key?: string; name?: string };
  reporter?: RawJiraUser | null;
  updated?: string;
}

interface RawJiraIssue {
  id: string;
  key: string;
  fields?: RawJiraIssueFields;
}

interface RawJiraComment {
  id: string;
  body?: unknown;
  created?: string;
  author?: RawJiraUser | null;
}

const ISSUE_FIELDS = 'summary,description,status,issuetype,project,reporter,updated';

function browseUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/browse/${key}`;
}

function mapIssue(baseUrl: string, issue: RawJiraIssue): JiraIssue {
  const fields = issue.fields ?? {};
  return {
    key: issue.key,
    id: issue.id,
    summary: fields.summary?.trim() || issue.key,
    description: normalizeDescription(fields.description),
    status: fields.status?.name ?? 'Unknown',
    issueType: fields.issuetype?.name ?? 'Issue',
    projectKey: fields.project?.key ?? issue.key.split('-')[0] ?? '',
    projectName: fields.project?.name ?? '',
    htmlUrl: browseUrl(baseUrl, issue.key),
    reporterDisplayName: fields.reporter?.displayName?.trim() || 'unknown',
    updatedAt: fields.updated ?? '',
  };
}

function mapComment(comment: RawJiraComment): JiraIssueComment {
  return {
    id: String(comment.id),
    authorDisplayName: comment.author?.displayName ?? null,
    body: normalizeDescription(comment.body),
    createdAt: comment.created ?? '',
  };
}

export async function getAuthenticatedDisplayName(ctx: JiraClientContext): Promise<string> {
  if (ctx.displayNameCache) return ctx.displayNameCache;
  const me = await request<{ displayName?: string; emailAddress?: string }>(ctx, '/rest/api/3/myself');
  const name = me.displayName?.trim() || me.emailAddress?.trim() || 'jira-user';
  ctx.displayNameCache = name;
  return name;
}

export async function listAssignedOpenIssues(ctx: JiraClientContext): Promise<JiraIssue[]> {
  const { baseUrl } = requireJiraConfig(ctx);
  const jql = encodeURIComponent(
    'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',
  );
  const result = await request<{ issues?: RawJiraIssue[] }>(
    ctx,
    `/rest/api/3/search/jql?jql=${jql}&maxResults=50&fields=${ISSUE_FIELDS}`,
  );
  return (result.issues ?? []).map((issue) => mapIssue(baseUrl, issue));
}

export async function getIssue(ctx: JiraClientContext, issueKey: string): Promise<JiraIssue> {
  const { baseUrl } = requireJiraConfig(ctx);
  const key = issueKey.trim().toUpperCase();
  const issue = await request<RawJiraIssue>(
    ctx,
    `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${ISSUE_FIELDS}`,
  );
  return mapIssue(baseUrl, issue);
}

export async function listIssueComments(
  ctx: JiraClientContext,
  issueKey: string,
): Promise<JiraIssueComment[]> {
  const key = issueKey.trim().toUpperCase();
  const result = await request<{ comments?: RawJiraComment[] }>(
    ctx,
    `/rest/api/3/issue/${encodeURIComponent(key)}/comment?maxResults=100&orderBy=created`,
  );
  return (result.comments ?? []).map(mapComment);
}

export async function getIssueDetail(
  ctx: JiraClientContext,
  issueKey: string,
): Promise<JiraIssueDetail> {
  const [issue, comments] = await Promise.all([
    getIssue(ctx, issueKey),
    listIssueComments(ctx, issueKey),
  ]);
  return { ...issue, comments };
}
