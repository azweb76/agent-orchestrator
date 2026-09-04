import type express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import { asyncHandler } from './helpers.js';
import {
  clearAssistantMessages,
  listAssistantMessages,
  runAssistantChat,
} from '../services/assistant-chat.js';
import { ASSISTANT_TOOLS } from '@agent-orchestrator/shared';

export function registerAssistantRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/assistant/tools',
    asyncHandler(async (_req, res) => {
      res.json({ tools: ASSISTANT_TOOLS });
    }),
  );

  router.get(
    '/assistant/messages',
    asyncHandler(async (_req, res) => {
      res.json({ messages: listAssistantMessages(ctx) });
    }),
  );

  router.delete(
    '/assistant/messages',
    asyncHandler(async (_req, res) => {
      clearAssistantMessages(ctx);
      res.status(204).end();
    }),
  );

  router.post(
    '/assistant/chat',
    asyncHandler(async (req, res) => {
      const body = z.object({ content: z.string().min(1) }).parse(req.body);
      const result = await runAssistantChat(ctx, body.content);
      res.json(result);
    }),
  );
}
