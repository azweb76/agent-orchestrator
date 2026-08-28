import {
  adoptParentClaudeSessionId,
  applyStreamEvent,
  claudeResultErrorMessage,
  isNestedSubagentEvent,
  isTopLevelClaudeResult,
  runningSubagentItems,
  type StreamPart,
} from '@agent-orchestrator/shared';
import {
  parsePermissionRequest,
  shouldAutoAllowToolPermission,
  type PermissionDecision,
} from './permission-protocol.js';
import { followClaudeLog, readClaudeLogSnapshot } from './claude-log.js';
import { cleanupStdinSidecars, killProcessTree } from './claude-process.js';
import { enrichPermissionInput } from './claude-permission-input.js';
import type {
  ClaudeEventMeta,
  ClaudePermissionRequest,
  ClaudeRunHandle,
  ClaudeRunResult,
  ClaudeStreamEvent,
  TrackedRun,
} from './claude-types.js';

/** True for the parent session's own model output (not nested subagent traffic). */
function isParentTurnActivity(
  event: Record<string, unknown>,
  parentSessionId: string | null,
): boolean {
  const type = String(event.type ?? '');
  if (type !== 'assistant' && type !== 'stream_event') return false;
  return !isNestedSubagentEvent(event, parentSessionId);
}

export interface ClaudeRunMonitorHost {
  wakeGraceMs: number;
  getTrackedRun(agentId: string): TrackedRun | undefined;
  closeStdinForRun(agentId: string, handlePid: number): void;
  reapAfterResult(agentId: string, handlePid: number, waitMs?: number): void;
  respondToPermission(
    agentId: string,
    requestId: string,
    decision: PermissionDecision,
    options?: { requirePending?: boolean },
  ): boolean;
  removeTrackedRunIfPid(agentId: string, handlePid: number): void;
}

export function stashPermissionRequest(
  tracked: TrackedRun,
  parsed: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    toolUseId?: string;
  },
): ClaudePermissionRequest {
  const input = enrichPermissionInput(parsed.toolName, parsed.input, {
    logPath: tracked.logPath,
  });
  const request: ClaudePermissionRequest = {
    requestId: parsed.requestId,
    toolName: parsed.toolName,
    input,
    toolUseId: parsed.toolUseId,
    requestedAt: Date.now(),
  };
  tracked.pendingPermissions.clear();
  tracked.pendingPermissions.set(parsed.requestId, request);
  return request;
}

/**
 * After log catch-up, emit still-pending prompts (or auto-allow ones that never
 * got a response because the previous orchestrator process died).
 */
export function flushReplayedPermissions(
  host: ClaudeRunMonitorHost,
  agentId: string,
  handlePid: number,
  options: {
    onPermissionRequest?: (request: ClaudePermissionRequest) => void;
  },
): void {
  const tracked = host.getTrackedRun(agentId);
  if (!tracked || tracked.pid !== handlePid) return;

  for (const request of [...tracked.pendingPermissions.values()]) {
    if (shouldAutoAllowToolPermission(request.toolName, tracked.permissionMode, request.input)) {
      if (tracked.canRespondToPermissions) {
        host.respondToPermission(
          agentId,
          request.requestId,
          { behavior: 'allow', updatedInput: request.input },
          { requirePending: false },
        );
      }
      continue;
    }
    options.onPermissionRequest?.(request);
  }
}

export function handleControlEvent(
  host: ClaudeRunMonitorHost,
  agentId: string,
  handlePid: number,
  event: Record<string, unknown>,
  options: {
    onPermissionRequest?: (request: ClaudePermissionRequest) => void;
  },
  meta: ClaudeEventMeta,
): void {
  const tracked = host.getTrackedRun(agentId);
  if (!tracked || tracked.pid !== handlePid) return;

  const parsed = parsePermissionRequest(event);
  if (parsed) {
    const request = stashPermissionRequest(tracked, parsed);
    if (meta.replay) {
      // Reconstruct pending state only — do not auto-respond or notify yet.
      return;
    }
    if (shouldAutoAllowToolPermission(parsed.toolName, tracked.permissionMode, parsed.input)) {
      if (tracked.canRespondToPermissions) {
        host.respondToPermission(
          agentId,
          parsed.requestId,
          {
            behavior: 'allow',
            updatedInput: parsed.input,
          },
          { requirePending: false },
        );
      }
      return;
    }
    options.onPermissionRequest?.(request);
    return;
  }

  // Claude continued past a permission prompt (it was answered). Drop it.
  if (meta.replay && event.type !== 'stderr') {
    tracked.pendingPermissions.clear();
  }
}

export async function monitorClaudeRun(
  host: ClaudeRunMonitorHost,
  agentId: string,
  handle: ClaudeRunHandle,
  initialSessionId: string | null,
  options: {
    onEvent?: (event: ClaudeStreamEvent, meta?: ClaudeEventMeta) => void;
    onPermissionRequest?: (request: ClaudePermissionRequest) => void;
    onCatchUp?: () => void;
  },
  signal?: AbortSignal,
): Promise<ClaudeRunResult> {
  const events: ClaudeStreamEvent[] = [];
  let result = '';
  let resultError: string | undefined;
  let sessionId: string | null = initialSessionId;
  let stopped = false;

  const handleAbort = () => {
    stopped = true;
    killProcessTree(handle.pid);
  };
  signal?.addEventListener('abort', handleAbort);
  if (signal?.aborted) {
    handleAbort();
  }

  // Mirrors the UI timeline so the run lifecycle knows when background
  // Task/Explore subagents are still running. The CLI emits the parent turn's
  // `result` while a background task is pending and — as long as stdin stays
  // open — wakes the model with a follow-up turn once the task settles.
  // Closing stdin / reaping at the first `result` would kill the subagent
  // mid-flight and silently end the chat.
  let lifecycleTimeline: StreamPart[] = [];
  let resultDeferred = false;
  let wakeTimer: NodeJS.Timeout | null = null;

  const clearWakeTimer = () => {
    if (wakeTimer) {
      clearTimeout(wakeTimer);
      wakeTimer = null;
    }
  };
  const endRunAfterResult = () => {
    const tracked = host.getTrackedRun(agentId);
    if (tracked?.pid !== handle.pid) return;
    // End stdin after the turn completes so the CLI can exit (stream-json keeps
    // the process open while stdin is still writable). Only touch this run —
    // Build may already have started a replacement process under the same agentId.
    host.closeStdinForRun(agentId, handle.pid);
    host.reapAfterResult(agentId, handle.pid);
  };
  const armWakeTimer = () => {
    if (wakeTimer) return;
    // Every background task settled after a deferred result. Give the CLI a
    // grace window to wake the model; close the run if no follow-up starts.
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      if (!resultDeferred || runningSubagentItems(lifecycleTimeline).length > 0) return;
      resultDeferred = false;
      endRunAfterResult();
    }, host.wakeGraceMs);
    wakeTimer.unref?.();
  };

  const processLine = (line: string, replay: boolean) => {
    try {
      const event = JSON.parse(line) as ClaudeStreamEvent;
      events.push(event);
      options.onEvent?.(event, { replay });

      const record = event as Record<string, unknown>;
      sessionId = adoptParentClaudeSessionId(sessionId, record);
      lifecycleTimeline = applyStreamEvent(lifecycleTimeline, record, sessionId);
      const tasksRunning = runningSubagentItems(lifecycleTimeline).length > 0;

      if (isTopLevelClaudeResult(event, sessionId)) {
        if (typeof event.result === 'string' && event.result) {
          // A wake turn (after a background task) adds its own result on top
          // of the deferred one; keep both for the persisted assistant turn.
          result = result ? `${result}\n\n${event.result}` : event.result;
        }
        resultError = claudeResultErrorMessage(record) ?? resultError;
        const trackedForResult = host.getTrackedRun(agentId);
        if (trackedForResult?.pid === handle.pid) {
          trackedForResult.pendingPermissions.clear();
          if (tasksRunning) {
            resultDeferred = true;
          } else {
            resultDeferred = false;
            clearWakeTimer();
            endRunAfterResult();
          }
        }
      } else if (resultDeferred && isParentTurnActivity(record, sessionId)) {
        // The CLI woke the model after a task settled; the follow-up turn's
        // own result decides when the run ends.
        resultDeferred = false;
        clearWakeTimer();
      }

      if (resultDeferred && !tasksRunning) {
        armWakeTimer();
      }

      const tracked = host.getTrackedRun(agentId);
      if (tracked?.pid === handle.pid && isParentTurnActivity(record, sessionId)) {
        tracked.lastStreamAt = Date.now();
      }

      handleControlEvent(host, agentId, handle.pid, record, options, {
        replay,
      });
    } catch {
      // ignore malformed lines
    }
  };

  try {
    const snapshot = await readClaudeLogSnapshot(handle.logPath);
    for (const line of snapshot.lines) {
      processLine(line, true);
    }
    flushReplayedPermissions(host, agentId, handle.pid, options);
    options.onCatchUp?.();

    await followClaudeLog(handle.pid, handle.logPath, (line) => processLine(line, false), {
      startPosition: snapshot.position,
      signal,
    });
  } finally {
    clearWakeTimer();
    signal?.removeEventListener('abort', handleAbort);
    const tracked = host.getTrackedRun(agentId);
    if (tracked?.pid === handle.pid) {
      host.closeStdinForRun(agentId, handle.pid);
      cleanupStdinSidecars(handle.logPath);
      host.removeTrackedRunIfPid(agentId, handle.pid);
    }
  }

  if (stopped && !result) {
    return { result: '[stopped]', sessionId, events, stopped: true, error: resultError };
  }

  return { result, sessionId, events, stopped, error: resultError };
}
