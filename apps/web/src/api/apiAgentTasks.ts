import type {
  AgentTask,
  CreateAgentTaskRequest,
  UpdateAgentTaskRequest,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiAgentTasks = {
  listAgentTasks: () => request<AgentTask[]>('/agent-tasks'),
  getAgentTask: (id: string) => request<AgentTask>(`/agent-tasks/${id}`),
  createAgentTask: (body: CreateAgentTaskRequest) =>
    request<AgentTask>('/agent-tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAgentTask: (id: string, body: UpdateAgentTaskRequest) =>
    request<AgentTask>(`/agent-tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteAgentTask: (id: string) =>
    request<void>(`/agent-tasks/${id}`, { method: 'DELETE' }),
};
