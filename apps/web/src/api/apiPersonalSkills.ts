import type {
  CreatePersonalSkillRequest,
  InstallRepoSkillsRequest,
  InstallRepoSkillsResult,
  PersonalSkill,
  PreviewRepoSkillsRequest,
  PreviewRepoSkillsResponse,
  UpdatePersonalSkillRequest,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiPersonalSkills = {
  listPersonalSkills: () => request<PersonalSkill[]>('/personal-skills'),
  getPersonalSkill: (slug: string) =>
    request<PersonalSkill>(`/personal-skills/${encodeURIComponent(slug)}`),
  createPersonalSkill: (body: CreatePersonalSkillRequest) =>
    request<PersonalSkill>('/personal-skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePersonalSkill: (slug: string, body: UpdatePersonalSkillRequest) =>
    request<PersonalSkill>(`/personal-skills/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deletePersonalSkill: (slug: string) =>
    request<void>(`/personal-skills/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  previewRepoSkills: (body: PreviewRepoSkillsRequest) =>
    request<PreviewRepoSkillsResponse>('/personal-skills/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  installRepoSkills: (body: InstallRepoSkillsRequest) =>
    request<InstallRepoSkillsResult>('/personal-skills/install', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
