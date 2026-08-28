import { v4 as uuidv4 } from 'uuid';
import type { AgentEvent } from '@agent-orchestrator/shared';
import type { AppEventType } from '@agent-orchestrator/shared';
import type { AppRepositories } from '../db/index.js';
import type { Notifier } from './notifier.js';
import type { ClaudeService, GitService } from './git.js';
import type { GitHubService } from './github.js';
import type { AnthropicService } from './anthropic.js';

export interface AppContext {
  repos: AppRepositories;
  git: GitService;
  github: GitHubService;
  claude: ClaudeService;
  anthropic: AnthropicService;
  dataDir: string;
  /** Live pub/sub for the global SSE stream; optional so tests can omit it. */
  notifier?: Notifier;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function notify(
  ctx: AppContext,
  type: AppEventType,
  fields: { agentId?: string; sessionId?: string; data?: Record<string, unknown> } = {},
): void {
  ctx.notifier?.emit(type, fields);
}

export function makeEvent(agentId: string, type: string, data: Record<string, unknown>): AgentEvent {
  return {
    id: uuidv4(),
    agentId,
    type,
    data,
    createdAt: nowIso(),
  };
}
