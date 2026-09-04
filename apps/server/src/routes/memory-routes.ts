import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  createAgentMemory,
  deleteAgentMemory,
  listAgentMemories,
  updateAgentMemory,
} from '../services/agent-memory.js';
import { dismissInstructionDraftOffer } from '../services/instruction-offers.js';
import { requireAgent } from '../services/agent-core.js';
import { asyncHandler, param } from './helpers.js';

const memoryScope = z.enum(['global', 'workspace', 'agent']);
const memoryKind = z.enum(['preference', 'lesson', 'fact']);
const memoryStatus = z.enum(['active', 'archived']);

export function registerMemoryRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/agents/:agentId/memories',
    asyncHandler(async (req, res) => {
      res.json(listAgentMemories(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/memories',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          scope: memoryScope,
          workspaceId: z.string().min(1).nullable().optional(),
          agentId: z.string().min(1).nullable().optional(),
          kind: memoryKind.optional(),
          key: z.string().trim().min(1).max(80),
          content: z.string().trim().min(1).max(4000),
          sourceSessionId: z.string().min(1).nullable().optional(),
        })
        .parse(req.body ?? {});
      res.status(201).json(createAgentMemory(ctx, param(req.params.agentId), body));
    }),
  );

  router.patch(
    '/agents/:agentId/memories/:memoryId',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          kind: memoryKind.optional(),
          key: z.string().trim().min(1).max(80).optional(),
          content: z.string().trim().min(1).max(4000).optional(),
          status: memoryStatus.optional(),
        })
        .parse(req.body ?? {});
      res.json(
        updateAgentMemory(
          ctx,
          param(req.params.agentId),
          param(req.params.memoryId),
          body,
        ),
      );
    }),
  );

  router.delete(
    '/agents/:agentId/memories/:memoryId',
    asyncHandler(async (req, res) => {
      deleteAgentMemory(ctx, param(req.params.agentId), param(req.params.memoryId));
      res.json({ deleted: true });
    }),
  );

  router.delete(
    '/agents/:agentId/instruction-draft-offer',
    asyncHandler(async (req, res) => {
      const agentId = param(req.params.agentId);
      requireAgent(ctx, agentId);
      dismissInstructionDraftOffer(ctx, agentId);
      res.json({ dismissed: true });
    }),
  );
}
