/**
 * Helpers for Claude Code's `--permission-prompt-tool stdio` control protocol.
 * Wire formats vary slightly across CLI versions; parsers accept the common shapes.
 */

export interface ParsedPermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseId?: string;
}

export type PermissionDecision =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message: string };

export function isControlRequestEvent(event: Record<string, unknown>): boolean {
  const type = String(event.type ?? '');
  return type === 'control_request' || type === 'sdk_control_request';
}

export function parsePermissionRequest(
  event: Record<string, unknown>,
): ParsedPermissionRequest | null {
  if (!isControlRequestEvent(event)) return null;

  const requestId =
    (typeof event.request_id === 'string' && event.request_id) ||
    (typeof (event.request as { request_id?: unknown } | undefined)?.request_id === 'string'
      ? String((event.request as { request_id: string }).request_id)
      : null);

  const request = (event.request as Record<string, unknown> | undefined) ?? undefined;
  if (!requestId || !request) return null;

  const subtype = String(request.subtype ?? '');
  if (subtype !== 'can_use_tool' && subtype !== 'permission') return null;

  const toolName = String(request.tool_name ?? request.toolName ?? '');
  if (!toolName) return null;

  const input =
    (request.input as Record<string, unknown> | undefined) ??
    (request.tool_input as Record<string, unknown> | undefined) ??
    {};

  const toolUseId =
    (typeof request.tool_use_id === 'string' && request.tool_use_id) ||
    (typeof request.toolUseId === 'string' && request.toolUseId) ||
    undefined;

  return { requestId, toolName, input, toolUseId };
}

/** Tools that always need an explicit user decision in the orchestrator UI. */
export function isInteractivePermissionTool(toolName: string): boolean {
  return toolName === 'AskUserQuestion' || toolName === 'ExitPlanMode';
}

export function buildControlResponse(
  requestId: string,
  decision: PermissionDecision,
): Record<string, unknown> {
  if (decision.behavior === 'allow') {
    return {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: 'allow',
          updatedInput: decision.updatedInput ?? {},
        },
      },
    };
  }

  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: {
        behavior: 'deny',
        message: decision.message || 'User denied this action',
      },
    },
  };
}
