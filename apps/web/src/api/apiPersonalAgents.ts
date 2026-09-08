import type {
  CreatePersonalAgentRequest,
  InstallRepoAgentsRequest,
  InstallRepoAgentsResult,
  PersonalAgent,
  PreviewRepoAgentsRequest,
  PreviewRepoAgentsResponse,
  UpdatePersonalAgentRequest,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiPersonalAgents = {
  listPersonalAgents: () => request<PersonalAgent[]>('/personal-agents'),
  getPersonalAgent: (slug: string) =>
    request<PersonalAgent>(`/personal-agents/${encodeURIComponent(slug)}`),
  createPersonalAgent: (body: CreatePersonalAgentRequest) =>
    request<PersonalAgent>('/personal-agents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePersonalAgent: (slug: string, body: UpdatePersonalAgentRequest) =>
    request<PersonalAgent>(`/personal-agents/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deletePersonalAgent: (slug: string) =>
    request<void>(`/personal-agents/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  previewRepoAgents: (body: PreviewRepoAgentsRequest) =>
    request<PreviewRepoAgentsResponse>('/personal-agents/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  installRepoAgents: (body: InstallRepoAgentsRequest) =>
    request<InstallRepoAgentsResult>('/personal-agents/install', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
