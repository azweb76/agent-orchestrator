import type { Response } from 'express';
import type { Message } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function attachChatSse(res: Response): void {
  try {
    res.socket?.setTimeout(0);
    res.socket?.setNoDelay?.(true);
  } catch {
    // ignore — some test doubles have no socket
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

export function writeSse(res: Response, event: string, data: unknown): boolean {
  if (res.writableEnded) return false;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Comment-line heartbeat so proxies do not drop a chat SSE during long silent
 * stretches (e.g. a slow tool call or a background task emitting no events).
 * Returns a stop function; safe to call more than once.
 */
export function startSseHeartbeat(res: Response, isOpen: () => boolean, intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    if (!isOpen() || res.writableEnded) return;
    try {
      res.write(': ping\n\n');
    } catch {
      // close handling elsewhere marks the client gone
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export async function resolveRunHandle(
  ctx: AppContext,
  sessionId: string,
  timeoutMs = 8_000,
): Promise<{ pid: number; logPath: string } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = ctx.repos.sessions.getById(sessionId);
    const tracked = ctx.claude.getRunningProcess(sessionId);
    const pid = tracked?.pid ?? session?.pid ?? null;
    const logPath = tracked?.logPath ?? session?.runLogPath ?? null;
    if (pid != null && logPath) return { pid, logPath };
    if (!session || session.status !== 'running') return null;
    await sleep(80);
  }
  const session = ctx.repos.sessions.getById(sessionId);
  const tracked = ctx.claude.getRunningProcess(sessionId);
  const pid = tracked?.pid ?? session?.pid ?? null;
  const logPath = tracked?.logPath ?? session?.runLogPath ?? null;
  if (pid != null && logPath) return { pid, logPath };
  return null;
}

export async function waitForSettledAssistant(
  ctx: AppContext,
  sessionId: string,
  timeoutMs = 5_000,
): Promise<Message | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = ctx.repos.sessions.getById(sessionId);
    const messages = ctx.repos.messages.listBySession(sessionId);
    const last = messages[messages.length - 1];
    const streaming = last?.role === 'assistant' && Boolean(last.metadata?.streaming);
    if (session?.status !== 'running' && !streaming) {
      return last?.role === 'assistant' ? last : undefined;
    }
    await sleep(50);
  }
  const last = ctx.repos.messages.listBySession(sessionId).at(-1);
  return last?.role === 'assistant' ? last : undefined;
}
