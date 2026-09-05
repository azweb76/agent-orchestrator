import type {
  CreateTaskFollowUpRequest,
  TaskFollowUp,
  UpdateTaskFollowUpRequest,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiTaskFollowUps = {
  listTaskFollowUps: () => request<TaskFollowUp[]>('/task-followups'),
  getTaskFollowUp: (id: string) => request<TaskFollowUp>(`/task-followups/${id}`),
  createTaskFollowUp: (body: CreateTaskFollowUpRequest) =>
    request<TaskFollowUp>('/task-followups', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTaskFollowUp: (id: string, body: UpdateTaskFollowUpRequest) =>
    request<TaskFollowUp>(`/task-followups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteTaskFollowUp: (id: string) =>
    request<void>(`/task-followups/${id}`, { method: 'DELETE' }),
};
