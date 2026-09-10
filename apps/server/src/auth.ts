import { createHash, timingSafeEqual } from 'node:crypto';
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

/**
 * Extract a presented auth token from the Authorization header or the cookie.
 *
 * A `?access_token=` query parameter is deliberately not accepted: URLs land in
 * browser history, Referer headers and proxy access logs. The SSE stream is
 * same-origin, so EventSource sends the cookie on its own.
 */
export function readPresentedAuthToken(req: {
  headers: { authorization?: string; cookie?: string };
}): string | undefined {
  return headerToken(req.headers.authorization) || cookieToken(req.headers.cookie);
}

/**
 * Constant-time token comparison. Both sides are hashed first so the comparison
 * is over fixed-width digests and the token's length does not leak either.
 */
export function tokensMatch(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const a = createHash('sha256').update(presented, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
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
    if (!tokensMatch(readPresentedAuthToken(req), expectedToken)) {
      res.status(401).json({ error: 'Unauthorized', authRequired: true });
      return;
    }
    next();
  };
}

/**
 * Serialized Set-Cookie value for the auth cookie. `Secure` is added only when
 * the request actually arrived over TLS: forcing it on a plaintext loopback
 * setup would stop the cookie being stored at all.
 */
export function authCookieHeader(token: string, secure: boolean): string {
  const attributes = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'SameSite=Lax',
    'HttpOnly',
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}
