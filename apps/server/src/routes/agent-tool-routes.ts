import express from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  commitAgentChanges,
  createAgentPullRequest,
  getAgentAttachment,
  getAgentDiff,
  listAgentMentionFiles,
  listAgentSlashCommands,
} from '../services/app.js';
import { asyncHandler, param } from './helpers.js';

export function registerAgentToolRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/agents/:agentId/attachments/:attachmentId',
    asyncHandler(async (req, res) => {
      const attachment = getAgentAttachment(
        ctx,
        param(req.params.agentId),
        param(req.params.attachmentId),
      );
      if (!fs.existsSync(attachment.path)) {
        res.status(404).json({ error: 'Attachment file missing' });
        return;
      }
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${attachment.name}"`);
      fs.createReadStream(attachment.path).pipe(res);
    }),
  );

  router.get(
    '/agents/:agentId/diff',
    asyncHandler(async (req, res) => {
      const scopeParse = z.enum(['pending', 'pr']).safeParse(req.query.scope ?? 'pending');
      if (!scopeParse.success) {
        res.status(400).json({ error: 'Invalid scope; use pending or pr' });
        return;
      }
      res.json(await getAgentDiff(ctx, param(req.params.agentId), scopeParse.data));
    }),
  );

  router.get(
    '/agents/:agentId/slash-commands',
    asyncHandler(async (req, res) => {
      res.json(await listAgentSlashCommands(ctx, param(req.params.agentId)));
    }),
  );

  router.get(
    '/agents/:agentId/mention-files',
    asyncHandler(async (req, res) => {
      res.json(await listAgentMentionFiles(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/create-pr',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().min(1),
          body: z.string().optional(),
          base: z.string().optional(),
          draft: z.boolean().optional(),
        })
        .parse(req.body);
      res.status(201).json(await createAgentPullRequest(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/commit',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          message: z.string().trim().max(4000).optional(),
          push: z.boolean().optional(),
        })
        .parse(req.body ?? {});
      res.json(await commitAgentChanges(ctx, param(req.params.agentId), body));
    }),
  );
}
