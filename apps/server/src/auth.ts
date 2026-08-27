import type { RequestHandler } from 'express';

const AUTH_COOKIE = 'ao_token';

function headerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function cookieToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === AUTH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function queryToken(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
  return undefined;
}

/** Extract a presented auth token from header, query, or cookie. */
export function readPresentedAuthToken(req: {
  headers: { authorization?: string; cookie?: string };
  query?: Record<string, unknown>;
}): string | undefined {
  return (
    headerToken(req.headers.authorization) ||
    queryToken(req.query?.access_token) ||
    cookieToken(req.headers.cookie)
  );
}

/**
 * Optional bearer-token gate. Disabled when AUTH_TOKEN is unset so a local
 * loopback bind is enough for the default single-user setup.
 */
export function optionalBearerAuth(expectedToken: string | undefined): RequestHandler {
  if (!expectedToken) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const presented = readPresentedAuthToken(req);
    if (presented !== expectedToken) {
      res.status(401).json({ error: 'Unauthorized', authRequired: true });
      return;
    }
    next();
  };
}

export function authCookieName(): string {
  return AUTH_COOKIE;
}
