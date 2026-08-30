import express from 'express';
import type { AppContext } from '../services/app.js';
import { getUsageSummary, listClaudeProcesses } from '../services/app.js';

export function registerEventsRoutes(router: express.Router, ctx: AppContext): void {
  // Global live-update stream: agent/session status, permission prompts, queue
  // and workspace changes. The web client uses it to invalidate caches and
  // raise notifications instead of polling every endpoint.
  router.get('/events/stream', (req, res) => {
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
    res.write(': connected\n\n');

    const writeEvent = (event: { id: string; type: string; data: unknown }) => {
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const lastEventId = req.header('Last-Event-ID') ?? undefined;
    for (const event of ctx.notifier?.replaySince(lastEventId) ?? []) {
      try {
        writeEvent(event);
      } catch {
        return;
      }
    }

    const unsubscribe = ctx.notifier?.subscribe((event) => {
      try {
        writeEvent(event);
      } catch {
        // dropped below via close
      }
    });
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        // close handler cleans up
      }
    }, 25_000);
    ping.unref?.();

    req.on('close', () => {
      clearInterval(ping);
      unsubscribe?.();
    });
  });

  router.get('/usage', (_req, res) => {
    res.json(getUsageSummary(ctx));
  });

  router.get('/claude/processes', (_req, res) => {
    res.json(listClaudeProcesses(ctx));
  });
}
