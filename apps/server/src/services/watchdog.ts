import type { ChatSession, WatchdogAlertKind } from '@agent-orchestrator/shared';
import { isPidAlive } from './git.js';
import type { AppContext } from './app.js';
import { getAppSettings } from './app-settings.js';

type AppEventType = 'watchdog_alert' | 'agent_changed';

function nowIso(): string {
  return new Date().toISOString();
}

function notify(
  ctx: AppContext,
  type: AppEventType,
  fields: { agentId?: string; sessionId?: string; data?: Record<string, unknown> } = {},
): void {
  ctx.notifier?.emit(type, fields);
}

function clearSessionRunFields(session: ChatSession): ChatSession {
  return {
    ...session,
    pid: null,
    status: 'idle',
    updatedAt: nowIso(),
  };
}

function markStreamingAssistantStopped(ctx: AppContext, agentId: string, sessionId: string): void {
  const messages = ctx.repos.messages.listBySession(sessionId);
  const last = messages[messages.length - 1];
  if (last?.role !== 'assistant' || !last.metadata?.streaming) return;
  ctx.repos.messages.update({
    ...last,
    content: last.content || '[stopped]',
    metadata: { ...last.metadata, streaming: false, stopped: true },
  });
}

function syncAgentFromSessions(ctx: AppContext, agentId: string): void {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) return;
  const sessions = ctx.repos.sessions.listByAgent(agentId);
  const anyRunning = sessions.some((item) => item.status === 'running');
  const active =
    sessions.find((item) => item.id === agent.activeSessionId) ?? sessions[0] ?? null;
  ctx.repos.agents.update({
    ...agent,
    status: agent.archivedAt ? 'archived' : anyRunning ? 'running' : 'idle',
    pid: active?.pid ?? null,
    runLogPath: active?.runLogPath ?? null,
    claudeSessionId: active?.claudeSessionId ?? null,
    updatedAt: nowIso(),
  });
  notify(ctx, 'agent_changed', { agentId, data: { status: anyRunning ? 'running' : 'idle' } });
}

/** In-memory stall flags for sidebar + alert deduplication. */
const stalledAgents = new Map<string, WatchdogAlertKind>();
const sentAlerts = new Set<string>();

function alertKey(sessionId: string, kind: WatchdogAlertKind): string {
  return `${sessionId}:${kind}`;
}

function markStalled(agentId: string, kind: WatchdogAlertKind): void {
  stalledAgents.set(agentId, kind);
}

function clearStalled(agentId: string): void {
  stalledAgents.delete(agentId);
}

export function isAgentStalled(agentId: string): boolean {
  return stalledAgents.has(agentId);
}

export function resetWatchdogState(): void {
  stalledAgents.clear();
  sentAlerts.clear();
}

function emitWatchdogAlert(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  kind: WatchdogAlertKind,
  message: string,
): void {
  const key = alertKey(sessionId, kind);
  if (sentAlerts.has(key)) return;
  sentAlerts.add(key);
  markStalled(agentId, kind);
  notify(ctx, 'watchdog_alert', {
    agentId,
    sessionId,
    data: { kind, message },
  });
  notify(ctx, 'agent_changed', { agentId, data: { stalled: true } });
}

function clearAlertIfResolved(sessionId: string, kind: WatchdogAlertKind): void {
  sentAlerts.delete(alertKey(sessionId, kind));
}

export function runWatchdogTick(ctx: AppContext): void {
  const settings = getAppSettings(ctx.repos);
  if (!settings.watchdogEnabled) return;

  const permissionMs = settings.watchdogPermissionMinutes * 60_000;
  const streamIdleMs = settings.watchdogStreamIdleMinutes * 60_000;
  const now = Date.now();

  for (const session of ctx.repos.sessions.listRunning()) {
    const agentId = session.agentId;
    const sessionId = session.id;
    let anyStall = false;

    const health = ctx.claude.getRunHealth(sessionId);
    for (const pending of health.pendingPermissions) {
      const age = now - pending.requestedAt;
      if (age >= permissionMs) {
        anyStall = true;
        emitWatchdogAlert(
          ctx,
          agentId,
          sessionId,
          'permission_stale',
          `Pending ${pending.toolName} for ${Math.floor(age / 60_000)} minutes.`,
        );
      } else {
        clearAlertIfResolved(sessionId, 'permission_stale');
      }
    }

    if (session.pid != null && isPidAlive(session.pid)) {
      const lastStreamAt = health.lastStreamAt;
      if (lastStreamAt != null && now - lastStreamAt >= streamIdleMs) {
        anyStall = true;
        emitWatchdogAlert(
          ctx,
          agentId,
          sessionId,
          'stream_idle',
          `No stream activity for ${Math.floor((now - lastStreamAt) / 60_000)} minutes while the process is still running.`,
        );
      } else if (lastStreamAt != null) {
        clearAlertIfResolved(sessionId, 'stream_idle');
      }
    }

    if (settings.watchdogStaleRunEnabled) {
      if (session.pid != null && !isPidAlive(session.pid)) {
        markStreamingAssistantStopped(ctx, agentId, sessionId);
        ctx.repos.sessions.update(clearSessionRunFields(session));
        syncAgentFromSessions(ctx, agentId);
        emitWatchdogAlert(
          ctx,
          agentId,
          sessionId,
          'stale_run',
          'Claude process exited but the session was still marked running; status corrected.',
        );
        anyStall = true;
      } else if (session.pid != null && isPidAlive(session.pid)) {
        clearAlertIfResolved(sessionId, 'stale_run');
      }
    }

    if (!anyStall) clearStalled(agentId);
  }
}

let watchdogTimer: NodeJS.Timeout | null = null;

export function startWatchdog(ctx: AppContext): void {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    try {
      runWatchdogTick(ctx);
    } catch (error) {
      console.error('Watchdog tick failed:', error);
    }
  }, 60_000);
  watchdogTimer.unref();
  // First tick soon after startup.
  setTimeout(() => runWatchdogTick(ctx), 5_000).unref();
}

export function stopWatchdog(): void {
  if (!watchdogTimer) return;
  clearInterval(watchdogTimer);
  watchdogTimer = null;
}
