import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { SidebarWorkspace } from '@agent-orchestrator/shared';
import { onAppEvent } from './api/events';
import {
  agentNameFromSidebar,
  currentNotificationPermission,
  describeNotificationEvent,
  navigationStateForEvent,
  notificationsSupported,
  readNotificationsEnabled,
  shouldShowInAppAttention,
  shouldShowOsNotification,
  writeNotificationsEnabled,
  type NotificationPermissionState,
} from './notifications/logic';
import {
  clearAttentionForAgent,
  pushAttentionAlert,
  type AttentionAlert,
} from './notifications/attention';

/** Bell toggle state; enabling requests browser permission when needed. */
export function useNotificationSettings(): {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermissionState;
  toggle: () => Promise<'enabled' | 'disabled' | 'blocked' | 'unsupported'>;
  requestPermission: () => Promise<NotificationPermissionState>;
  setEnabled: (value: boolean) => void;
} {
  const [enabled, setEnabled] = useState(readNotificationsEnabled);
  const [permission, setPermission] = useState(currentNotificationPermission);

  useEffect(() => {
    const refreshPermission = () => setPermission(currentNotificationPermission());
    window.addEventListener('focus', refreshPermission);
    document.addEventListener('visibilitychange', refreshPermission);
    return () => {
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', refreshPermission);
    };
  }, []);

  const persist = useCallback((value: boolean) => {
    setEnabled(value);
    writeNotificationsEnabled(value);
  }, []);

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
    if (!notificationsSupported()) return 'unsupported';
    if (enabled) {
      persist(false);
      return 'disabled';
    }
    if (Notification.permission === 'denied') return 'blocked';
    const next = await requestPermission();
    const granted = next === 'granted';
    persist(granted);
    return granted ? 'enabled' : next === 'denied' ? 'blocked' : 'disabled';
  }, [enabled, persist, requestPermission]);

  const setEnabledValue = useCallback(
    (value: boolean) => {
      persist(value);
    },
    [persist],
  );

  return {
    supported: notificationsSupported(),
    enabled,
    permission,
    toggle,
    requestPermission,
    setEnabled: setEnabledValue,
  };
}

function openAgentFromAlert(
  navigate: ReturnType<typeof useNavigate>,
  alert: AttentionAlert,
): void {
  navigate(`/agents/${alert.agentId}`, {
    state: navigationStateForEvent({
      id: alert.id,
      type: alert.eventType,
      agentId: alert.agentId,
      sessionId: alert.sessionId,
      data: {},
      createdAt: '',
    }),
  });
}

/**
 * Raise browser notifications and in-app attention alerts for agent events.
 * OS notifications are skipped when the user is already on that agent page, or
 * when the tab is visible (in-app fallback is clearer). In-app alerts also
 * cover denied/unsupported Notification API cases.
 */
export function useAppNotifications(): {
  openAttentionAlert: (alert: AttentionAlert) => void;
} {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [visibilityState, setVisibilityState] = useState(document.visibilityState);

  useEffect(() => {
    const onVisibilityChange = () => setVisibilityState(document.visibilityState);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const openAttentionAlert = useCallback(
    (alert: AttentionAlert) => {
      openAgentFromAlert(navigate, alert);
    },
    [navigate],
  );

  useEffect(() => {
    const match = location.pathname.match(/^\/agents\/([^/]+)/);
    if (match?.[1] && document.visibilityState === 'visible') {
      clearAttentionForAgent(match[1]);
    }
  }, [location.pathname]);

  useEffect(() => {
    return onAppEvent((event) => {
      if (!event.agentId) return;
      if (event.type !== 'run_finished' && event.type !== 'permission_request' && event.type !== 'automation_triggered') return;

      const tree = queryClient.getQueryData<SidebarWorkspace[]>(['sidebar']);
      const name = agentNameFromSidebar(tree, event.agentId);
      const context = {
        event,
        enabled: readNotificationsEnabled(),
        permission: currentNotificationPermission(),
        pathname: location.pathname,
        visibilityState,
      };

      if (shouldShowInAppAttention(context)) {
        pushAttentionAlert(event, name);
      }

      if (shouldShowOsNotification(context)) {
        const described = describeNotificationEvent(event, name);
        if (!described) return;
        const alert: AttentionAlert = {
          id: event.id,
          agentId: event.agentId,
          sessionId: event.sessionId,
          title: described.title,
          body: described.body,
          eventType: event.type,
        };
        const notification = new Notification(described.title, {
          body: described.body,
          tag: event.id,
        });
        notification.onclick = () => {
          window.focus();
          openAgentFromAlert(navigate, alert);
          notification.close();
        };
      }
    });
  }, [location.pathname, navigate, queryClient, visibilityState]);

  return { openAttentionAlert };
}

export {
  permissionStatusLabel,
  type AgentAttentionFocus,
  type AgentAttentionNavigationState,
} from './notifications/logic';
