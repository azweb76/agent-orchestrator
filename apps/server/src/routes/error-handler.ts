import express from 'express';
import { z } from 'zod';
import { GitHubApiError } from '../services/github.js';
import { BranchExistsError } from '../services/git-errors.js';

export function errorHandler(
  err: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation error', details: err.issues });
    return;
  }

  if (err instanceof BranchExistsError) {
    res.status(err.status).json({ error: err.message, code: err.code, branch: err.branch });
    return;
  }

  // Must precede the message sniff below so GitHub's 405/409/422 merge errors
  // arrive as readable client errors instead of a generic 500.
  if (err instanceof GitHubApiError) {
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    res.status(status).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = message.includes('not found') ? 404 : 500;
  res.status(status).json({ error: message });
}
