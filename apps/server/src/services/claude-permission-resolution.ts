/**
 * Bookkeeping for `TrackedRun.pendingPermissions` — resolving requests that a
 * run can no longer answer, and recognizing genuine evidence (as opposed to
 * unrelated log traffic) that a replayed request was already answered.
 */
import type { PermissionDecision } from './permission-protocol.js';
import type { TrackedRun } from './claude-types.js';

export interface PermissionResponder {
  respondToPermission(
    agentId: string,
    requestId: string,
    decision: PermissionDecision,
    options?: { requirePending?: boolean },
  ): boolean;
}

/** Deny (or drop, if stdin is unavailable) every still-unanswered permission request. */
export function resolveUnansweredPermissions(
  host: PermissionResponder,
  agentId: string,
  tracked: TrackedRun,
): void {
  for (const requestId of [...tracked.pendingPermissions.keys()]) {
    host.respondToPermission(
      agentId,
      requestId,
      { behavior: 'deny', message: 'The run ended before this request could be answered' },
      { requirePending: false },
    );
  }
  tracked.pendingPermissions.clear();
}

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** tool_use_id values with direct evidence of completion (a tool_result, or a fresh tool_use). */
function resolvedToolUseIds(event: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const addFromBlocks = (content: unknown) => {
    if (!Array.isArray(content)) return;
    for (const block of content) {
      const b = asPlainRecord(block);
      if (!b) continue;
      if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') ids.add(b.tool_use_id);
      if (b.type === 'tool_use' && typeof b.id === 'string') ids.add(b.id);
    }
  };
  addFromBlocks(asPlainRecord(event.message)?.content);
  addFromBlocks(event.content);
  if (event.type === 'tool_result' && typeof event.tool_use_id === 'string') {
    ids.add(event.tool_use_id);
  }
  if (event.type === 'tool_use' && typeof event.id === 'string') {
    ids.add(event.id);
  }
  return ids;
}

/**
 * Clear only the pending permission(s) with direct evidence they were resolved —
 * a matching control_response, or a tool_result/tool_use for the same
 * tool_use_id. Unrelated replay traffic (stream_event deltas for sibling
 * parallel tool_use blocks, task_progress from a background subagent) carries
 * no such evidence and must not drop still-pending requests.
 */
export function clearResolvedReplayedPermissions(
  tracked: TrackedRun,
  event: Record<string, unknown>,
): void {
  if (tracked.pendingPermissions.size === 0) return;

  if (event.type === 'control_response') {
    const response = asPlainRecord(event.response);
    const requestId =
      (typeof event.request_id === 'string' && event.request_id) ||
      (typeof response?.request_id === 'string' && response.request_id) ||
      null;
    if (requestId) tracked.pendingPermissions.delete(requestId);
    return;
  }

  const resolvedIds = resolvedToolUseIds(event);
  if (resolvedIds.size === 0) return;
  for (const [requestId, request] of tracked.pendingPermissions) {
    if (request.toolUseId && resolvedIds.has(request.toolUseId)) {
      tracked.pendingPermissions.delete(requestId);
    }
  }
}
