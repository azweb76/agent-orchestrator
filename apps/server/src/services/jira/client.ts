import { JiraApiError } from './errors.js';

export interface JiraApiOptions {
  baseUrl?: string;
  email?: string;
  apiToken?: string;
}

export interface JiraClientContext {
  options: JiraApiOptions;
  displayNameCache: string | null | undefined;
}

export function createJiraClientContext(options: JiraApiOptions = {}): JiraClientContext {
  return {
    options,
    displayNameCache: undefined,
  };
}

export function resetJiraCaches(ctx: JiraClientContext): void {
  ctx.displayNameCache = undefined;
}

export function isJiraConfigured(options: JiraApiOptions = {}): boolean {
  return Boolean(options.baseUrl?.trim() && options.email?.trim() && options.apiToken?.trim());
}

export function requireJiraConfig(ctx: JiraClientContext): {
  baseUrl: string;
  email: string;
  apiToken: string;
} {
  const baseUrl = ctx.options.baseUrl?.trim().replace(/\/+$/, '') ?? '';
  const email = ctx.options.email?.trim() ?? '';
  const apiToken = ctx.options.apiToken?.trim() ?? '';
  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      'Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.',
    );
  }
  return { baseUrl, email, apiToken };
}

export function errorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as {
      errorMessages?: string[];
      message?: string;
      errorMessage?: string;
    };
    if (parsed?.errorMessages?.length) return parsed.errorMessages.join('; ');
    if (parsed?.errorMessage) return parsed.errorMessage;
    if (parsed?.message) return parsed.message;
  } catch {
    // Non-JSON error body.
  }
  return `Jira API error ${status}: ${body}`;
}

export async function request<T>(
  ctx: JiraClientContext,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { baseUrl, email, apiToken } = requireJiraConfig(ctx);
  const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
    'User-Agent': 'agent-orchestrator',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new JiraApiError(errorMessage(text, response.status), response.status, url);
  }

  return (text ? JSON.parse(text) : undefined) as T;
}
