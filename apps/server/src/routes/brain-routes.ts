import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import { asyncHandler } from './helpers.js';
import {
  connectBrainRepo,
  createBrainPullRequest,
  disconnectBrainRepo,
  getBrainSyncStatus,
  pullBrainRepo,
} from '../services/brain-sync.js';

const connectBody = z.object({
  repoUrl: z.string().min(1).max(500),
});

const prBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(20_000).optional(),
  draft: z.boolean().optional(),
});

export function registerBrainRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/brain/sync',
    asyncHandler(async (_req, res) => {
      res.json(await getBrainSyncStatus(ctx));
    }),
  );

  router.post(
    '/brain/sync',
    asyncHandler(async (req, res) => {
      const body = connectBody.parse(req.body ?? {});
      res.status(201).json(await connectBrainRepo(ctx, body));
    }),
  );

  router.delete(
    '/brain/sync',
    asyncHandler(async (_req, res) => {
      res.json(await disconnectBrainRepo(ctx));
    }),
  );

  router.post(
    '/brain/sync/pull',
    asyncHandler(async (_req, res) => {
      res.json(await pullBrainRepo(ctx));
    }),
  );

  router.post(
    '/brain/sync/pull-request',
    asyncHandler(async (req, res) => {
      const body = prBody.parse(req.body ?? {});
      res.status(201).json(await createBrainPullRequest(ctx, body));
    }),
  );
}
