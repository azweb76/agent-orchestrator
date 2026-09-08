import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  createPersonalAgent,
  deletePersonalAgent,
  getPersonalAgent,
  listPersonalAgents,
  updatePersonalAgent,
} from '../services/personal-agents.js';
import { installRepoAgents, previewRepoAgents } from '../services/personal-agent-install.js';
import { asyncHandler, param } from './helpers.js';

const createBody = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).optional(),
  content: z.string().min(1).max(200_000),
});

const updateBody = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  content: z.string().min(1).max(200_000).optional(),
});

const repoSourceBody = z.object({
  repo: z.string().min(1).max(240).optional(),
  ref: z.string().min(1).max(200).optional(),
  workspaceId: z.string().min(1).max(80).optional(),
});

const installBody = repoSourceBody.extend({
  slugs: z.array(z.string().min(1).max(80)).min(1).max(40),
  overwrite: z.boolean().optional(),
});

export function registerPersonalAgentRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/personal-agents',
    asyncHandler(async (_req, res) => {
      res.json(await listPersonalAgents());
    }),
  );

  router.post(
    '/personal-agents/preview',
    asyncHandler(async (req, res) => {
      const body = repoSourceBody.parse(req.body ?? {});
      res.json(await previewRepoAgents(ctx, body));
    }),
  );

  router.post(
    '/personal-agents/install',
    asyncHandler(async (req, res) => {
      const body = installBody.parse(req.body ?? {});
      res.json(await installRepoAgents(ctx, body));
    }),
  );

  router.get(
    '/personal-agents/:slug',
    asyncHandler(async (req, res) => {
      res.json(await getPersonalAgent(param(req.params.slug)));
    }),
  );

  router.post(
    '/personal-agents',
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body ?? {});
      res.status(201).json(await createPersonalAgent(body));
    }),
  );

  router.put(
    '/personal-agents/:slug',
    asyncHandler(async (req, res) => {
      const body = updateBody.parse(req.body ?? {});
      res.json(await updatePersonalAgent(param(req.params.slug), body));
    }),
  );

  router.delete(
    '/personal-agents/:slug',
    asyncHandler(async (req, res) => {
      await deletePersonalAgent(param(req.params.slug));
      res.status(204).end();
    }),
  );
}
