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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function parsePermissionRequest(
  event: Record<string, unknown>,
): ParsedPermissionRequest | null {
  if (!isControlRequestEvent(event)) return null;

  const request = asRecord(event.request) ?? asRecord(event.payload);
  if (!request) return null;

  const requestId =
    (typeof event.request_id === 'string' && event.request_id) ||
    (typeof request.request_id === 'string' && request.request_id) ||
    (typeof event.requestId === 'string' && event.requestId) ||
    null;
  if (!requestId) return null;

  const subtype = String(request.subtype ?? event.subtype ?? '');
  if (subtype !== 'can_use_tool' && subtype !== 'permission') return null;

  const toolName = String(request.tool_name ?? request.toolName ?? '');
  if (!toolName) return null;

  const input =
    asRecord(request.input) ??
    asRecord(request.tool_input) ??
    asRecord(request.toolInput) ??
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

/**
 * Whether a non-interactive tool permission can be auto-allowed without UI.
 * AskUserQuestion / ExitPlanMode are never auto-allowed.
 *
 * Modes that already minimize prompting (`auto`, `dontAsk`, `bypassPermissions`)
 * auto-allow ordinary tools if Claude still sends a can_use_tool request.
 * Manual / plan / acceptEdits surface those prompts on the agent page.
 */
export function shouldAutoAllowToolPermission(
  toolName: string,
  permissionMode: string | null | undefined,
): boolean {
  if (isInteractivePermissionTool(toolName)) return false;
  const mode = permissionMode ?? 'plan';
  return mode === 'auto' || mode === 'dontAsk' || mode === 'bypassPermissions';
}

/** Safe read-only tools that may run without a UI prompt. */
export const SAFE_AUTO_ALLOWED_TOOLS = 'Read,Glob,Grep';

/**
 * Build `--allowedTools` for a permission mode.
 * Never includes AskUserQuestion / ExitPlanMode — those must hit the stdio
 * permission prompt so the agent page can collect answers / plan approval.
 * (`--allowedTools` means auto-approve without prompting.)
 */
export function allowedToolsForPermissionMode(
  permissionMode: string | null | undefined,
): string {
  const mode = permissionMode ?? 'plan';
  switch (mode) {
    case 'acceptEdits':
      return `${SAFE_AUTO_ALLOWED_TOOLS},Edit,Write`;
    case 'auto':
    case 'dontAsk':
    case 'bypassPermissions':
      return `${SAFE_AUTO_ALLOWED_TOOLS},Edit,Write,Bash`;
    case 'default':
    case 'plan':
    default:
      return SAFE_AUTO_ALLOWED_TOOLS;
  }
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
