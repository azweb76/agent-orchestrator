import type { ClaudeProcessInfo, UsageSummary } from '@agent-orchestrator/shared';
import { request } from './request';
import type { SetupInfo, SystemStatus } from './types';

export const apiSetup = {
  getStatus: () => request<SystemStatus>('/status'),
  getSetupInfo: () => request<SetupInfo>('/setup'),
  configureGithubToken: (token: string) =>
    request<{ githubLogin: string }>('/setup/github-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  configureClaudeBin: (claudeBin: string) =>
    request<{ ok: true }>('/setup/claude-bin', {
      method: 'POST',
      body: JSON.stringify({ claudeBin }),
    }),
  verifyClaudeAuth: () =>
    request<{ ok: true; loggedIn: boolean; email?: string }>('/setup/claude-auth', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  submitAuth: (token: string) =>
    request<{ ok?: true } | void>('/auth', { method: 'POST', body: JSON.stringify({ token }) }),
  getUsageSummary: () => request<UsageSummary>('/usage'),
  listClaudeProcesses: () => request<ClaudeProcessInfo[]>('/claude/processes'),
  stopClaudeProcess: (pid: number) =>
    request<{
      stopped: true;
      pid: number;
      ownership: 'orchestrator' | 'external';
      agentId: string | null;
      sessionId: string | null;
    }>(`/claude/processes/${pid}/stop`, { method: 'POST' }),
};
