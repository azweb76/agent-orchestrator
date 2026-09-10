import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { GitHubApiError } from '../services/github.js';
import { BranchExistsError } from '../services/git-errors.js';
import { WorktreeFileError } from '../services/agents-files.js';

/**
 * Whether an error message is safe to hand back to the caller.
 *
 * Service errors like 'Workspace not found' are meant for the UI. But every
 * `execFile` rejection also lands here, and its message is the failed command
 * line — absolute repo paths, and the configured git remote URL, which is
 * exactly where an embedded credential would sit. Anything path-like,
 * URL-like, multi-line or long is therefore withheld and only logged.
 */
function isSafeClientMessage(message: string): boolean {
  if (!message || message.length > 160) return false;
  if (/[\n\r]/.test(message)) return false;
  if (message.includes('/') || message.includes('\\')) return false;
  return !/https?:|Command failed|ENOENT|EACCES|spawn |execFile|node_modules/i.test(message);
}

export function errorHandler(
  err: unknown,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation error', details: err.issues });
    return;
  }

  if (err instanceof WorktreeFileError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof BranchExistsError) {
    res.status(err.status).json({ error: err.message, code: err.code, branch: err.branch });
    return;
  }

  // Must precede the message classification below so GitHub's 405/409/422 merge
  // errors arrive as readable client errors instead of a generic 500.
  if (err instanceof GitHubApiError) {
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    res.status(status).json({ error: err.message });
    return;
  }

  // Everything unrecognized is logged with an id the user can quote. Without
  // this, every 500 in the app was invisible server-side.
  const correlationId = randomUUID().slice(0, 8);
  // Constant format string: req.originalUrl is caller-controlled, and
  // interpolating it would let a '%s' in the URL consume the error argument and
  // forge the log line.
  console.error('[error %s] %s %s', correlationId, req.method, req.originalUrl, err);

  // SSE routes flush headers early and then keep doing work that can throw.
  // res.status().json() would throw ERR_HTTP_HEADERS_SENT here, Express would
  // fall through to finalhandler, and the socket would be destroyed — the
  // browser sees an opaque reset instead of a clean end.
  if (res.headersSent) {
    try {
      if (String(res.getHeader('Content-Type') ?? '').includes('text/event-stream')) {
        res.write(`event: error\ndata: ${JSON.stringify({ correlationId })}\n\n`);
      }
      res.end();
    } catch {
      // connection already gone
    }
    return;
  }

  const message = err instanceof Error ? err.message : '';
  if (isSafeClientMessage(message)) {
    // Preserve the existing not-found mapping for messages we do return.
    const status = message.toLowerCase().includes('not found') ? 404 : 500;
    res.status(status).json({ error: message, correlationId });
    return;
  }

  res.status(500).json({ error: 'Internal server error', correlationId });
}
