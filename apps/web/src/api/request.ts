export const API_BASE = '/api';

/**
 * The auth token is held only in the HttpOnly `ao_token` cookie the server sets
 * at POST /api/auth. It is deliberately not mirrored into localStorage: a copy
 * there is readable by any script on the page, which would undo the point of
 * the HttpOnly cookie. Every request sends `credentials: 'include'` instead.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const extra = init?.headers;
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    Object.assign(headers, extra as Record<string, string>);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    const error = new Error(body.error ?? 'Request failed') as Error & {
      authRequired?: boolean;
      status?: number;
      code?: string;
      branch?: string;
    };
    error.status = response.status;
    if (typeof body.code === 'string') error.code = body.code;
    if (typeof body.branch === 'string') error.branch = body.branch;
    if (body.authRequired || response.status === 401) error.authRequired = true;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
