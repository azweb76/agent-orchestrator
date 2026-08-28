import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  allowPermissionRequest,
  answerAskUserQuestion,
  buildApprovedPlan,
  clearAgentChat,
  denyPermissionRequest,
  enqueueChatMessage,
  followAgentSession,
  getAgentMessages,
  listPendingPermissions,
  listQueuedMessages,
  removeQueuedMessage,
  rewindAgentChat,
  streamAgentChat,
} from '../services/app.js';
import { compactAndContinueSession } from '../services/compact-continue.js';
import { asyncHandler, param } from './helpers.js';
import { chatBody, queueBody } from './schemas.js';

export function registerChatRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/agents/:agentId/sessions/:sessionId/permissions',
    asyncHandler(async (req, res) => {
      res.json(listPendingPermissions(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/permissions/answer',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          answers: z.record(z.string(), z.string()),
          response: z.string().optional(),
        })
        .parse(req.body);
      res.json(
        await answerAskUserQuestion(
          ctx,
          param(req.params.agentId),
          body,
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/permissions/allow',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          updatedInput: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(req.body);
      res.json(
        await allowPermissionRequest(
          ctx,
          param(req.params.agentId),
          body,
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/permissions/deny',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          message: z.string().optional(),
        })
        .parse(req.body);
      res.json(
        await denyPermissionRequest(
          ctx,
          param(req.params.agentId),
          body,
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/compact',
    asyncHandler(async (req, res) => {
      await compactAndContinueSession(
        ctx,
        param(req.params.agentId),
        res,
        param(req.params.sessionId),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/permissions/build',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().optional(),
          plan: z.string().optional(),
        })
        .parse(req.body);
      await buildApprovedPlan(
        ctx,
        param(req.params.agentId),
        body,
        res,
        param(req.params.sessionId),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/chat',
    asyncHandler(async (req, res) => {
      const body = chatBody.parse(req.body);
      await streamAgentChat(
        ctx,
        param(req.params.agentId),
        body,
        res,
        param(req.params.sessionId),
      );
    }),
  );

  router.get(
    '/agents/:agentId/sessions/:sessionId/stream',
    asyncHandler(async (req, res) => {
      await followAgentSession(
        ctx,
        param(req.params.agentId),
        param(req.params.sessionId),
        res,
      );
    }),
  );

  router.get(
    '/agents/:agentId/sessions/:sessionId/queue',
    asyncHandler(async (req, res) => {
      res.json(listQueuedMessages(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/queue',
    asyncHandler(async (req, res) => {
      const body = queueBody.parse(req.body);
      res
        .status(201)
        .json(
          await enqueueChatMessage(
            ctx,
            param(req.params.agentId),
            param(req.params.sessionId),
            body,
          ),
        );
    }),
  );

  router.delete(
    '/agents/:agentId/sessions/:sessionId/queue/:queuedId',
    asyncHandler(async (req, res) => {
      res.json(
        await removeQueuedMessage(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
          param(req.params.queuedId),
        ),
      );
    }),
  );

  router.get(
    '/agents/:agentId/messages',
    asyncHandler(async (req, res) => {
      res.json(getAgentMessages(ctx, param(req.params.agentId)));
    }),
  );

  router.delete(
    '/agents/:agentId/messages',
    asyncHandler(async (req, res) => {
      res.json(await clearAgentChat(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/messages/rewind',
    asyncHandler(async (req, res) => {
      const body = z.object({ messageId: z.string().min(1) }).parse(req.body);
      res.json(await rewindAgentChat(ctx, param(req.params.agentId), body));
    }),
  );

  router.get(
    '/agents/:agentId/permissions',
    asyncHandler(async (req, res) => {
      res.json(listPendingPermissions(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/permissions/answer',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          answers: z.record(z.string(), z.string()),
          response: z.string().optional(),
        })
        .parse(req.body);
      res.json(await answerAskUserQuestion(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/permissions/allow',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          updatedInput: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(req.body);
      res.json(await allowPermissionRequest(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/permissions/deny',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          message: z.string().optional(),
        })
        .parse(req.body);
      res.json(await denyPermissionRequest(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/permissions/build',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().optional(),
          plan: z.string().optional(),
        })
        .parse(req.body);
      await buildApprovedPlan(ctx, param(req.params.agentId), body, res);
    }),
  );

  router.post(
    '/agents/:agentId/chat',
    asyncHandler(async (req, res) => {
      const body = chatBody.parse(req.body);
      await streamAgentChat(ctx, param(req.params.agentId), body, res);
    }),
  );
}
