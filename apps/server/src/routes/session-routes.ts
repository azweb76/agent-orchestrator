import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  activateAgentSession,
  applyAgentInstructionFile,
  clearAgentChat,
  createAgentSession,
  deleteAgentSession,
  generateAgentInstructionDraft,
  getAgentMessages,
  getAgentSessionContext,
  gradeAgentSession,
  listAgentInstructionFiles,
  rewindAgentChat,
  stopAgentSession,
  updateAgentSession,
} from '../services/app.js';
import { asyncHandler, param } from './helpers.js';
import { sessionTemplate } from './schemas.js';

export function registerSessionRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/sessions/search',
    asyncHandler(async (req, res) => {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const limit =
        typeof req.query.limit === 'string' && /^\d+$/.test(req.query.limit)
          ? Math.min(Number(req.query.limit), 48)
          : 24;
      const { searchSessionTranscripts } = await import('../services/session-search-index.js');
      res.json(searchSessionTranscripts(ctx, query, limit));
    }),
  );

  router.post(
    '/agents/:agentId/sessions',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          template: sessionTemplate.optional(),
          title: z.string().trim().min(1).max(80).optional(),
        })
        .parse(req.body ?? {});
      res.status(201).json(await createAgentSession(ctx, param(req.params.agentId), body));
    }),
  );

  router.patch(
    '/agents/:agentId/sessions/:sessionId',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().trim().min(1).max(80).optional(),
          model: z.string().optional(),
          effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
          permissionMode: z
            .enum(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'])
            .optional(),
        })
        .parse(req.body);
      res.json(
        await updateAgentSession(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
          body,
        ),
      );
    }),
  );

  router.delete(
    '/agents/:agentId/sessions/:sessionId',
    asyncHandler(async (req, res) => {
      res.json(
        await deleteAgentSession(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.put(
    '/agents/:agentId/sessions/:sessionId/grade',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          notes: z.string().max(4000).optional(),
        })
        .parse(req.body ?? {});
      res.json(
        await gradeAgentSession(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
          body,
        ),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/instruction-drafts',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          kind: z.enum(['skill', 'claude_md', 'agents_md']),
          scope: z.enum(['project', 'personal']).optional(),
          relativePath: z.string().min(1).max(240).optional(),
          name: z.string().max(80).optional(),
          extraNotes: z.string().max(4000).optional(),
        })
        .parse(req.body);
      res.json(
        await generateAgentInstructionDraft(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
          body,
        ),
      );
    }),
  );

  router.get(
    '/agents/:agentId/instruction-files',
    asyncHandler(async (req, res) => {
      res.json(await listAgentInstructionFiles(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/instruction-files',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          kind: z.enum(['skill', 'claude_md', 'agents_md']),
          scope: z.enum(['project', 'personal']),
          content: z.string().min(1).max(200_000),
          name: z.string().max(80).optional(),
          relativePath: z.string().min(1).max(240).optional(),
        })
        .parse(req.body);
      res.json(await applyAgentInstructionFile(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/activate',
    asyncHandler(async (req, res) => {
      res.json(
        await activateAgentSession(ctx, param(req.params.agentId), param(req.params.sessionId)),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/stop',
    asyncHandler(async (req, res) => {
      res.json(await stopAgentSession(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.get(
    '/agents/:agentId/sessions/:sessionId/messages',
    asyncHandler(async (req, res) => {
      res.json(getAgentMessages(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.get(
    '/agents/:agentId/sessions/:sessionId/context',
    asyncHandler(async (req, res) => {
      res.json(
        await getAgentSessionContext(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.delete(
    '/agents/:agentId/sessions/:sessionId/messages',
    asyncHandler(async (req, res) => {
      res.json(await clearAgentChat(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/messages/rewind',
    asyncHandler(async (req, res) => {
      const body = z.object({ messageId: z.string().min(1) }).parse(req.body);
      res.json(
        await rewindAgentChat(
          ctx,
          param(req.params.agentId),
          body,
          param(req.params.sessionId),
        ),
      );
    }),
  );
}
