import type { AppEvent } from '@agent-orchestrator/shared';

export const NOTIFICATIONS_STORAGE_KEY = 'ao.notifications.enabled';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export type AgentAttentionFocus = 'needs-input' | 'run-finished';

export interface AgentAttentionNavigationState {
  focusAttention?: AgentAttentionFocus;
  sessionId?: string;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function readNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeNotificationsEnabled(value: boolean): void {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export function currentNotificationPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export function agentNameFromSidebar(
  tree: { agents: { id: string; name: string }[] }[] | undefined,
  agentId: string | null,
): string {
  if (!tree || !agentId) return 'Agent';
  for (const workspace of tree) {
    const agent = workspace.agents.find((item) => item.id === agentId);
    if (agent) return agent.name;
  }
  return 'Agent';
}

export function describeNotificationEvent(
  event: AppEvent,
  name: string,
): { title: string; body: string } | null {
  if (event.type === 'run_finished') {
    const error = typeof event.data.error === 'string' && event.data.error ? event.data.error : null;
    const stopped = Boolean(event.data.stopped);
    if (error) return { title: `${name} failed`, body: error.slice(0, 140) };
    if (stopped) return { title: `${name} stopped`, body: 'The run was interrupted.' };
    return { title: `${name} finished`, body: 'The reply is ready to review.' };
  }
  if (event.type === 'permission_request') {
    const tool = typeof event.data.toolName === 'string' ? event.data.toolName : 'a tool';
    const body =
      tool === 'AskUserQuestion'
        ? 'Claude has a question for you.'
        : tool === 'ExitPlanMode'
          ? 'A plan is ready for review.'
          : `Claude wants to use ${tool}.`;
    return { title: `${name} needs your input`, body };
  }
  if (event.type === 'automation_triggered') {
    const action = typeof event.data.action === 'string' ? event.data.action : '';
    const pr =
      typeof event.data.number === 'number'
        ? `PR #${event.data.number}`
        : 'pull request';
    switch (action) {
      case 'fix_ci_started':
        return { title: `${name}: Fix CI started`, body: `Auto-started Fix CI for ${pr}.` };
      case 'fix_ci_cap_hit':
        return {
          title: `${name}: Fix CI cap reached`,
          body: `Retry limit hit for ${pr}; manual intervention needed.`,
        };
      case 'address_review_started':
        return {
          title: `${name}: Address review started`,
          body: `Auto-started Address review for ${pr}.`,
        };
      case 'archive_completed':
        return { title: `${name} archived`, body: `Auto-archived after ${pr} merged.` };
      case 'archive_skipped':
        return {
          title: `${name}: auto-archive skipped`,
          body:
            event.data.reason === 'dirty_worktree'
              ? 'Uncommitted changes in the worktree.'
              : 'No linked pull request.',
        };
      default:
        return null;
    }
  }
  return null;
}

export function isNotifiableEvent(event: AppEvent): boolean {
  return describeNotificationEvent(event, 'Agent') !== null;
}

export function isViewingAgent(
  agentId: string,
  pathname: string,
  visibilityState: DocumentVisibilityState = 'visible',
): boolean {
  return visibilityState === 'visible' && pathname === `/agents/${agentId}`;
}

export function canUseOsNotifications(
  enabled: boolean,
  permission: NotificationPermissionState,
): boolean {
  return enabled && permission === 'granted';
}

export function shouldShowOsNotification(input: {
  event: AppEvent;
  enabled: boolean;
  permission: NotificationPermissionState;
  pathname: string;
  visibilityState: DocumentVisibilityState;
}): boolean {
  if (!input.event.agentId || !isNotifiableEvent(input.event)) return false;
  if (isViewingAgent(input.event.agentId, input.pathname, input.visibilityState)) return false;
  if (!canUseOsNotifications(input.enabled, input.permission)) return false;
  // When the tab is visible, in-app attention is clearer than OS banners.
  if (input.visibilityState === 'visible') return false;
  return true;
}

export function shouldShowInAppAttention(input: {
  event: AppEvent;
  pathname: string;
  visibilityState: DocumentVisibilityState;
}): boolean {
  if (!input.event.agentId || !isNotifiableEvent(input.event)) return false;
  if (input.visibilityState !== 'visible') return false;
  return !isViewingAgent(input.event.agentId, input.pathname, input.visibilityState);
}

export function navigationStateForEvent(event: AppEvent): AgentAttentionNavigationState {
  if (event.type === 'permission_request') {
    return {
      focusAttention: 'needs-input',
      sessionId: event.sessionId ?? undefined,
    };
  }
  if (event.type === 'run_finished' || event.type === 'automation_triggered') {
    return {
      focusAttention: 'run-finished',
      sessionId: event.sessionId ?? undefined,
    };
  }
  return {};
}

export function permissionStatusLabel(permission: NotificationPermissionState): string {
  switch (permission) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'default':
      return 'Default';
    default:
      return 'Unsupported';
  }
}
