import type {
  BrainSyncStatus,
  ConnectBrainRepoRequest,
  CreateBrainPullRequestRequest,
} from '@agent-orchestrator/shared';
import { request } from './request';

export const apiBrain = {
  getBrainSync: () => request<BrainSyncStatus>('/brain/sync'),
  connectBrainRepo: (body: ConnectBrainRepoRequest) =>
    request<BrainSyncStatus>('/brain/sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  disconnectBrainRepo: () =>
    request<BrainSyncStatus>('/brain/sync', { method: 'DELETE' }),
  pullBrainRepo: () => request<BrainSyncStatus>('/brain/sync/pull', { method: 'POST' }),
  createBrainPullRequest: (body: CreateBrainPullRequestRequest) =>
    request<{ number: number; htmlUrl: string; status: BrainSyncStatus }>(
      '/brain/sync/pull-request',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
};
