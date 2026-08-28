import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { AppEvent, SidebarWorkspace } from '@agent-orchestrator/shared';
import { onAppEvent } from './api/events';

const STORAGE_KEY = 'ao.notifications.enabled';

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function currentPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/** Bell toggle state; enabling requests browser permission when needed. */
export function useNotificationSettings(): {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermission | 'unsupported';
  toggle: () => Promise<void>;
  requestPermission: () => Promise<NotificationPermission | 'unsupported'>;
  setEnabled: (value: boolean) => void;
} {
  const [enabled, setEnabled] = useState(loadEnabled);
  const [permission, setPermission] = useState(currentPermission);

  const persist = (value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  };

  const requestPermission = useCallback(async () => {
    if (!notificationsSupported()) return 'unsupported';
    if (Notification.permission === 'granted') {
      setPermission('granted');
      return 'granted';
    }
    const next = await Notification.requestPermission();
    setPermission(next);
    return next;
  }, []);

  const toggle = useCallback(async () => {
    if (!notificationsSupported()) return;
    if (enabled) {
      persist(false);
      return;
    }
    const next = await requestPermission();
    persist(next === 'granted');
  }, [enabled, requestPermission]);

  const setEnabledValue = useCallback((value: boolean) => {
    persist(value);
  }, []);

  return {
    supported: notificationsSupported(),
    enabled,
    permission,
    toggle,
    requestPermission,
    setEnabled: setEnabledValue,
  };
}

function agentName(tree: SidebarWorkspace[] | undefined, agentId: string | null): string {
  if (!tree || !agentId) return 'Agent';
  for (const workspace of tree) {
    const agent = workspace.agents.find((item) => item.id === agentId);
    if (agent) return agent.name;
  }
  return 'Agent';
}

function describeEvent(event: AppEvent, name: string): { title: string; body: string } | null {
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
  return null;
}

/**
 * Raise browser notifications for agent events that need attention. Skipped
 * when notifications are disabled, or when the user is already looking at the
 * agent's page in a visible tab.
 */
export function useAppNotifications(): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    return onAppEvent((event) => {
      if (!loadEnabled() || !notificationsSupported()) return;
      if (Notification.permission !== 'granted') return;
      if (event.type !== 'run_finished' && event.type !== 'permission_request') return;
      if (!event.agentId) return;

      const viewingAgent =
        document.visibilityState === 'visible' &&
        window.location.pathname === `/agents/${event.agentId}`;
      if (viewingAgent) return;

      const tree = queryClient.getQueryData<SidebarWorkspace[]>(['sidebar']);
      const described = describeEvent(event, agentName(tree, event.agentId));
      if (!described) return;

      const notification = new Notification(described.title, {
        body: described.body,
        tag: `${event.type}-${event.agentId}`,
      });
      notification.onclick = () => {
        window.focus();
        navigate(`/agents/${event.agentId}`);
        notification.close();
      };
    });
  }, [navigate, queryClient]);
}
