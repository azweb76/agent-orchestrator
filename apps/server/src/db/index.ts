import type Database from 'better-sqlite3';
import { AppSettingsRepository } from './repositories/app-settings.js';
import { AutomationStateRepository } from './repositories/automation-state.js';
import { AgentRepository } from './repositories/agent.js';
import { ChatSessionRepository } from './repositories/chat-session.js';
import { EventRepository } from './repositories/event.js';
import { MessageRepository } from './repositories/message.js';
import { QueuedMessageRepository } from './repositories/queued-message.js';
import { WorkspaceRepository } from './repositories/workspace.js';
import { WorktreeRepository } from './repositories/worktree.js';

export { DATABASE_FILENAME, initDatabase } from './migrate.js';
export { AppSettingsRepository } from './repositories/app-settings.js';
export { AutomationStateRepository } from './repositories/automation-state.js';
export { AgentRepository } from './repositories/agent.js';
export { ChatSessionRepository } from './repositories/chat-session.js';
export { EventRepository } from './repositories/event.js';
export { MessageRepository } from './repositories/message.js';
export { QueuedMessageRepository } from './repositories/queued-message.js';
export { WorkspaceRepository } from './repositories/workspace.js';
export { WorktreeRepository } from './repositories/worktree.js';

export type AppRepositories = {
  workspaces: WorkspaceRepository;
  worktrees: WorktreeRepository;
  agents: AgentRepository;
  sessions: ChatSessionRepository;
  messages: MessageRepository;
  events: EventRepository;
  queued: QueuedMessageRepository;
  settings: AppSettingsRepository;
  automationState: AutomationStateRepository;
};

export function createRepositories(db: Database.Database): AppRepositories {
  return {
    workspaces: new WorkspaceRepository(db),
    worktrees: new WorktreeRepository(db),
    agents: new AgentRepository(db),
    sessions: new ChatSessionRepository(db),
    messages: new MessageRepository(db),
    events: new EventRepository(db),
    queued: new QueuedMessageRepository(db),
    settings: new AppSettingsRepository(db),
    automationState: new AutomationStateRepository(db),
  };
}
