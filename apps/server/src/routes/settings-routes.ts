import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import { asyncHandler } from './helpers.js';
import {
  getAutomationSettings,
  setAutomationSettings,
} from '../services/automation-settings.js';
import { getAppSettings, updateAppSettings } from '../services/app-settings.js';
import { triggerGithubPollNow } from '../services/github-poll-bus.js';

const automationBody = z.object({
  enabled: z.boolean().optional(),
  pollIntervalSeconds: z.number().int().min(30).max(900).optional(),
  autoFixCi: z.boolean().optional(),
  autoAddressReview: z.boolean().optional(),
  autoArchiveOnMerge: z.boolean().optional(),
  autoArchiveDeleteWorktree: z.boolean().optional(),
  autoArchiveAllowDirty: z.boolean().optional(),
  autopilot: z.boolean().optional(),
});

const appSettingsBody = z.object({
  dailySpendCapUsd: z.number().positive().nullable().optional(),
  perAgentSpendCapUsd: z.number().positive().nullable().optional(),
  watchdogEnabled: z.boolean().optional(),
  watchdogPermissionMinutes: z.number().int().min(1).optional(),
  watchdogStreamIdleMinutes: z.number().int().min(1).optional(),
  watchdogStaleRunEnabled: z.boolean().optional(),
});

export function registerSettingsRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/settings',
    asyncHandler(async (_req, res) => {
      res.json(getAppSettings(ctx.repos));
    }),
  );

  router.put(
    '/settings',
    asyncHandler(async (req, res) => {
      const body = appSettingsBody.parse(req.body ?? {});
      res.json(updateAppSettings(ctx.repos, body));
    }),
  );

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

  router.post(
    '/settings/automation/poll-now',
    asyncHandler(async (_req, res) => {
      res.json(await triggerGithubPollNow(ctx));
    }),
  );
}
