import type {
  CreateSessionProfileRequest,
  SessionProfile,
  UpdateSessionProfileRequest,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiSessionProfiles = {
  listSessionProfiles: () => request<SessionProfile[]>('/session-profiles'),
  getSessionProfile: (id: string) => request<SessionProfile>(`/session-profiles/${id}`),
  createSessionProfile: (body: CreateSessionProfileRequest) =>
    request<SessionProfile>('/session-profiles', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSessionProfile: (id: string, body: UpdateSessionProfileRequest) =>
    request<SessionProfile>(`/session-profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteSessionProfile: (id: string) =>
    request<void>(`/session-profiles/${id}`, { method: 'DELETE' }),
};
