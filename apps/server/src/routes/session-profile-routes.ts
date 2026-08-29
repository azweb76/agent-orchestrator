import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import { asyncHandler, param } from './helpers.js';
import {
  createSessionProfile,
  deleteSessionProfile,
  getSessionProfile,
  listSessionProfiles,
  updateSessionProfile,
} from '../services/session-profiles.js';

const permissionMode = z.enum([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
]);

const effort = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

const createBody = z.object({
  name: z.string().min(1).max(63),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  promptTemplate: z.string().max(20_000).nullable().optional(),
  systemPrompt: z.string().max(20_000).nullable().optional(),
  allowedTools: z.string().max(2000).nullable().optional(),
  model: z.string().min(1).max(64).optional(),
  effort: effort.optional(),
  permissionMode: permissionMode.optional(),
  listed: z.boolean().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(63).optional(),
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  promptTemplate: z.string().max(20_000).nullable().optional(),
  systemPrompt: z.string().max(20_000).nullable().optional(),
  allowedTools: z.string().max(2000).nullable().optional(),
  model: z.string().min(1).max(64).optional(),
  effort: effort.optional(),
  permissionMode: permissionMode.optional(),
  listed: z.boolean().optional(),
});

export function registerSessionProfileRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/session-profiles',
    asyncHandler(async (_req, res) => {
      res.json(listSessionProfiles(ctx));
    }),
  );

  router.get(
    '/session-profiles/:profileId',
    asyncHandler(async (req, res) => {
      res.json(getSessionProfile(ctx, param(req.params.profileId)));
    }),
  );

  router.post(
    '/session-profiles',
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body ?? {});
      res.status(201).json(createSessionProfile(ctx, body));
    }),
  );

  router.put(
    '/session-profiles/:profileId',
    asyncHandler(async (req, res) => {
      const body = updateBody.parse(req.body ?? {});
      res.json(updateSessionProfile(ctx, param(req.params.profileId), body));
    }),
  );

  router.delete(
    '/session-profiles/:profileId',
    asyncHandler(async (req, res) => {
      deleteSessionProfile(ctx, param(req.params.profileId));
      res.status(204).end();
    }),
  );
}
