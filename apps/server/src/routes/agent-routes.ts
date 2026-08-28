import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  archiveAgent,
  deleteAgent,
  getAgentDetail,
  pruneArchivedAgents,
  unarchiveAgent,
  updateAgent,
} from '../services/app.js';
import { asyncHandler, param } from './helpers.js';

export function registerAgentRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/agents/:agentId',
    asyncHandler(async (req, res) => {
      res.json(await getAgentDetail(ctx, param(req.params.agentId)));
    }),
  );

  router.patch(
    '/agents/:agentId',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          autopilot: z.boolean().nullable().optional(),
        })
        .parse(req.body ?? {});
      res.json(await updateAgent(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/prune-archived',
    asyncHandler(async (_req, res) => {
      res.json(await pruneArchivedAgents(ctx));
    }),
  );

  router.get(
    '/fleet/merged-agents',
    asyncHandler(async (_req, res) => {
      const { listMergedFleetAgents } = await import('../services/fleet-bulk.js');
      res.json(await listMergedFleetAgents(ctx));
    }),
  );

  router.post(
    '/agents/:agentId/archive',
    asyncHandler(async (req, res) => {
      const body = z.object({ deleteWorktree: z.boolean().optional() }).parse(req.body ?? {});
      res.json(await archiveAgent(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/unarchive',
    asyncHandler(async (req, res) => {
      res.json(await unarchiveAgent(ctx, param(req.params.agentId)));
    }),
  );

  router.delete(
    '/agents/:agentId',
    asyncHandler(async (req, res) => {
      const deleteWorktree =
        req.query.deleteWorktree === 'true' || req.query.deleteWorktree === '1';
      res.json(await deleteAgent(ctx, param(req.params.agentId), { deleteWorktree }));
    }),
  );
}
