import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  configureClaudeBin,
  configureGithubToken,
  getSetupInfo,
  getSystemStatus,
} from '../services/app.js';
import { authCookieName } from '../auth.js';
import { asyncHandler } from './helpers.js';
import { checkClaudeAuth } from '../services/claude-auth.js';
import { invalidateStatusCache } from '../services/status-cache.js';

export function registerAuthRoutes(router: express.Router, ctx: AppContext): void {
  router.post('/auth', (req, res) => {
    const expected = process.env.AUTH_TOKEN?.trim();
    if (!expected) {
      res.status(204).end();
      return;
    }
    const body = z.object({ token: z.string().min(1) }).parse(req.body ?? {});
    if (body.token !== expected) {
      res.status(401).json({ error: 'Unauthorized', authRequired: true });
      return;
    }
    res.setHeader(
      'Set-Cookie',
      `${authCookieName()}=${encodeURIComponent(body.token)}; Path=/; SameSite=Lax; HttpOnly`,
    );
    res.json({ ok: true });
  });

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      res.json(await getSystemStatus(ctx));
    }),
  );

  router.get(
    '/setup',
    asyncHandler(async (_req, res) => {
      res.json(await getSetupInfo(ctx));
    }),
  );

  router.post(
    '/setup/github-token',
    asyncHandler(async (req, res) => {
      const body = z.object({ token: z.string().min(1) }).parse(req.body ?? {});
      res.json(await configureGithubToken(ctx, body.token));
    }),
  );

  router.post(
    '/setup/claude-bin',
    asyncHandler(async (req, res) => {
      const body = z.object({ claudeBin: z.string().min(1) }).parse(req.body ?? {});
      await configureClaudeBin(ctx, body.claudeBin);
      res.json({ ok: true });
    }),
  );

  router.post(
    '/setup/claude-auth',
    asyncHandler(async (_req, res) => {
      const status = await checkClaudeAuth(ctx.claude.getBin());
      invalidateStatusCache();
      if (!status.loggedIn) {
        res.status(400).json({
          error: 'Claude Code is not logged in. Run `claude login` in a terminal, then retry.',
          loggedIn: false,
        });
        return;
      }
      res.json({ ok: true, ...status });
    }),
  );
}
