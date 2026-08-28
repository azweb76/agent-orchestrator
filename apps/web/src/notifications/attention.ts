import { useEffect, useState } from 'react';
import type { AppEvent } from '@agent-orchestrator/shared';
import { describeNotificationEvent } from './logic';

export interface AttentionAlert {
  id: string;
  agentId: string;
  sessionId: string | null;
  title: string;
  body: string;
  eventType: AppEvent['type'];
}

const alerts = new Map<string, AttentionAlert>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // subscriber errors must not break attention fan-out
    }
  }
}

export function pushAttentionAlert(event: AppEvent, agentName: string): AttentionAlert | null {
  if (!event.agentId) return null;
  const described = describeNotificationEvent(event, agentName);
  if (!described) return null;

  const alert: AttentionAlert = {
    id: event.id,
    agentId: event.agentId,
    sessionId: event.sessionId,
    title: described.title,
    body: described.body,
    eventType: event.type,
  };
  alerts.set(alert.id, alert);
  notifyListeners();
  return alert;
}

export function dismissAttentionAlert(id: string): void {
  if (!alerts.delete(id)) return;
  notifyListeners();
}

export function clearAttentionForAgent(agentId: string): void {
  let changed = false;
  for (const [id, alert] of alerts) {
    if (alert.agentId === agentId) {
      alerts.delete(id);
      changed = true;
    }
  }
  if (changed) notifyListeners();
}

function listAttentionAlerts(): AttentionAlert[] {
  return [...alerts.values()];
}

export function useAttentionAlerts(): AttentionAlert[] {
  const [items, setItems] = useState(listAttentionAlerts);
  useEffect(() => {
    const refresh = () => setItems(listAttentionAlerts());
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, []);
  return items;
}
