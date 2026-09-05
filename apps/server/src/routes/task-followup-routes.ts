import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import { asyncHandler, param } from './helpers.js';
import {
  createTaskFollowUp,
  deleteTaskFollowUp,
  getTaskFollowUp,
  listTaskFollowUps,
  updateTaskFollowUp,
} from '../services/task-followups.js';

const suggestionKind = z.enum(['prompt', 'commit-and-push', 'start-template']);

const templateId = z.enum([
  'chat',
  'build',
  'create-draft-pr',
  'review',
  'address-review',
  'fix-ci',
  'resolve-conflicts',
]);

const createBody = z.object({
  name: z.string().min(1).max(63),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  prompt: z.string().min(1).max(20_000),
  kind: suggestionKind.optional(),
  template: templateId.nullable().optional(),
  enabled: z.boolean().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(63).optional(),
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  prompt: z.string().min(1).max(20_000).optional(),
  kind: suggestionKind.optional(),
  template: templateId.nullable().optional(),
  enabled: z.boolean().optional(),
});

export function registerTaskFollowUpRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/task-followups',
    asyncHandler(async (_req, res) => {
      res.json(listTaskFollowUps(ctx));
    }),
  );

  router.get(
    '/task-followups/:followUpId',
    asyncHandler(async (req, res) => {
      res.json(getTaskFollowUp(ctx, param(req.params.followUpId)));
    }),
  );

  router.post(
    '/task-followups',
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body ?? {});
      res.status(201).json(createTaskFollowUp(ctx, body));
    }),
  );

  router.put(
    '/task-followups/:followUpId',
    asyncHandler(async (req, res) => {
      const body = updateBody.parse(req.body ?? {});
      res.json(updateTaskFollowUp(ctx, param(req.params.followUpId), body));
    }),
  );

  router.delete(
    '/task-followups/:followUpId',
    asyncHandler(async (req, res) => {
      deleteTaskFollowUp(ctx, param(req.params.followUpId));
      res.status(204).end();
    }),
  );
}
