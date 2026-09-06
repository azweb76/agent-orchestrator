import type express from 'express';
import { z } from 'zod';
import type { AssistantStreamEvent } from '@agent-orchestrator/shared';
import { ASSISTANT_TOOLS } from '@agent-orchestrator/shared';
import type { AppContext } from '../services/app.js';
import { asyncHandler } from './helpers.js';
import {
  clearAssistantMessages,
  listAssistantMessages,
  runAssistantChat,
} from '../services/assistant-chat.js';

function writeAssistantSse(res: express.Response, event: AssistantStreamEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

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

  router.post('/assistant/chat/stream', (req, res) => {
    const parsed = z.object({ content: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    try {
      res.socket?.setTimeout(0);
    } catch {
      // ignore
    }
    res.flushHeaders?.();

    const abort = new AbortController();
    req.on('close', () => {
      abort.abort();
    });

    void runAssistantChat(ctx, parsed.data.content, {
      signal: abort.signal,
      onEvent: (event) => {
        try {
          writeAssistantSse(res, event);
        } catch {
          abort.abort();
        }
      },
    })
      .then(() => {
        res.end();
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          try {
            writeAssistantSse(res, { type: 'error', message });
          } catch {
            // client gone
          }
        }
        res.end();
      });
  });
}
