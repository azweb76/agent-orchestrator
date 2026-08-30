import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import { asyncHandler, param } from './helpers.js';
import {
  createAgentTask,
  deleteAgentTask,
  getAgentTask,
  listAgentTasks,
  updateAgentTask,
} from '../services/agent-tasks.js';

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
  purpose: z.string().max(4000).optional(),
  promptTemplate: z.string().max(20_000).nullable().optional(),
  systemPrompt: z.string().max(20_000).nullable().optional(),
  allowedTools: z.string().max(8000).nullable().optional(),
  model: z.string().min(1).max(64).optional(),
  effort: effort.optional(),
  permissionMode: permissionMode.optional(),
  listed: z.boolean().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(63).optional(),
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  purpose: z.string().max(4000).optional(),
  promptTemplate: z.string().max(20_000).nullable().optional(),
  systemPrompt: z.string().max(20_000).nullable().optional(),
  allowedTools: z.string().max(8000).nullable().optional(),
  model: z.string().min(1).max(64).optional(),
  effort: effort.optional(),
  permissionMode: permissionMode.optional(),
  listed: z.boolean().optional(),
});

export function registerAgentTaskRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/agent-tasks',
    asyncHandler(async (_req, res) => {
      res.json(listAgentTasks(ctx));
    }),
  );

  router.get(
    '/agent-tasks/:taskId',
    asyncHandler(async (req, res) => {
      res.json(getAgentTask(ctx, param(req.params.taskId)));
    }),
  );

  router.post(
    '/agent-tasks',
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body ?? {});
      res.status(201).json(createAgentTask(ctx, body));
    }),
  );

  router.put(
    '/agent-tasks/:taskId',
    asyncHandler(async (req, res) => {
      const body = updateBody.parse(req.body ?? {});
      res.json(updateAgentTask(ctx, param(req.params.taskId), body));
    }),
  );

  router.delete(
    '/agent-tasks/:taskId',
    asyncHandler(async (req, res) => {
      deleteAgentTask(ctx, param(req.params.taskId));
      res.status(204).end();
    }),
  );
}
