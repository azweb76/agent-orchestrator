import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import { asyncHandler } from './helpers.js';
import {
  getAutomationSettings,
  setAutomationSettings,
} from '../services/automation-settings.js';

const automationBody = z.object({
  enabled: z.boolean().optional(),
  pollIntervalSeconds: z.number().int().min(30).max(900).optional(),
  autoFixCi: z.boolean().optional(),
  autoAddressReview: z.boolean().optional(),
  autoArchiveOnMerge: z.boolean().optional(),
  autoArchiveDeleteWorktree: z.boolean().optional(),
  autoArchiveAllowDirty: z.boolean().optional(),
});

export function registerSettingsRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/settings/automation',
    asyncHandler(async (_req, res) => {
      res.json(getAutomationSettings(ctx));
    }),
  );

  router.put(
    '/settings/automation',
    asyncHandler(async (req, res) => {
      const body = automationBody.parse(req.body ?? {});
      res.json(setAutomationSettings(ctx, body));
    }),
  );
}
