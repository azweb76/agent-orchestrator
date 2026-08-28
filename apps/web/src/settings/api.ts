import type { AppSettings } from '@agent-orchestrator/shared';
import { request } from '../api/request';

export function getSettings(): Promise<AppSettings> {
  return request<AppSettings>('/settings');
}

export function updateSettings(body: Partial<AppSettings>): Promise<AppSettings> {
  return request<AppSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
