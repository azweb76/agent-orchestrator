import type { RequestHandler } from 'express';

/**
 * Loopback bind addresses. A loopback bind is only reachable from this machine,
 * which is why AUTH_TOKEN stays optional for the default single-user setup.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0:0:0:0:0:0:0:1']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/** Strip the optional `:port` (and IPv6 brackets) from a Host header value. */
function hostnameFromHeader(header: string): string {
  const value = header.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(0, end + 1);
  }
  const colon = value.lastIndexOf(':');
  return colon === -1 ? value : value.slice(0, colon);
}

/**
 * Response hardening for the SPA and the API. Written by hand rather than
 * pulling in a middleware package: the app serves one bundled origin and needs
 * a handful of headers, not a framework.
 *
 * `style-src` allows inline styles because MUI/emotion injects `<style>` tags at
 * runtime. `img-src` allows https: so markdown rendered from PR and issue bodies
 * can still show remote images.
 */
export function securityHeaders(): RequestHandler {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  };
}

/**
 * Reject API requests whose Host header is not one we bound to.
 *
 * A loopback bind is a network boundary, not an origin boundary: a page in the
 * user's browser can reach 127.0.0.1, and an attacker-controlled name that
 * resolves to 127.0.0.1 (DNS rebinding) reaches it with a foreign Host header.
 * Enforced only for loopback binds — a deliberately exposed bind is reachable
 * under many legitimate names and is gated by AUTH_TOKEN instead (see
 * `assertSecureBind`).
 */
export function hostGuard(boundHost: string, extraHosts: string[] = []): RequestHandler {
  if (!isLoopbackHost(boundHost)) {
    return (_req, _res, next) => next();
  }

  const allowed = new Set<string>([...LOOPBACK_HOSTS]);
  for (const host of extraHosts) {
    const trimmed = host.trim().toLowerCase();
    if (trimmed) allowed.add(trimmed);
  }

  return (req, res, next) => {
    const header = req.headers.host;
    if (!header) {
      res.status(400).json({ error: 'Missing Host header' });
      return;
    }
    if (!allowed.has(hostnameFromHeader(header))) {
      res.status(403).json({ error: 'Forbidden host' });
      return;
    }
    next();
  };
}

export interface SecureBindResult {
  ok: boolean;
  message?: string;
}

/**
 * A non-loopback bind exposes agent orchestration — worktree reads, agent
 * spawning, writes under the user's home — to the network. README documents
 * that HOST must be paired with AUTH_TOKEN; enforce it rather than trusting the
 * doc, mirroring the hard invariant `mcp.ts` already applies to its own token.
 */
export function checkSecureBind(
  host: string,
  authToken: string | undefined,
  allowInsecure: boolean,
): SecureBindResult {
  if (isLoopbackHost(host) || authToken || allowInsecure) return { ok: true };
  return {
    ok: false,
    message:
      `Refusing to bind ${host} without AUTH_TOKEN: the API would be reachable ` +
      'from the network with no authentication. Set AUTH_TOKEN, bind 127.0.0.1, ' +
      'or set ALLOW_INSECURE_HOST=1 to override.',
  };
}
