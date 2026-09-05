import type Database from 'better-sqlite3';
import { AgentTaskRepository } from './repositories/agent-task.js';
import { TaskFollowUpRepository } from './repositories/task-followup.js';
import { AppSettingsRepository } from './repositories/app-settings.js';
import { AutomationStateRepository } from './repositories/automation-state.js';
import { AgentRepository } from './repositories/agent.js';
import { AgentMemoryRepository } from './repositories/agent-memory.js';
import { AssistantMessageRepository } from './repositories/assistant-message.js';
import { ChatSessionRepository } from './repositories/chat-session.js';
import { EventRepository } from './repositories/event.js';
import { MessageRepository } from './repositories/message.js';
import { QueuedMessageRepository } from './repositories/queued-message.js';
import { WorkspaceRepository } from './repositories/workspace.js';
import { WorktreeRepository } from './repositories/worktree.js';
import { SessionSearchIndexRepository } from './repositories/session-search-index.js';

export { DATABASE_FILENAME, initDatabase } from './migrate.js';
export { AgentTaskRepository } from './repositories/agent-task.js';
export { TaskFollowUpRepository } from './repositories/task-followup.js';
export { AppSettingsRepository } from './repositories/app-settings.js';
export { AutomationStateRepository } from './repositories/automation-state.js';
export { AgentRepository } from './repositories/agent.js';
export { AgentMemoryRepository } from './repositories/agent-memory.js';
export { AssistantMessageRepository } from './repositories/assistant-message.js';
export { ChatSessionRepository } from './repositories/chat-session.js';
export { EventRepository } from './repositories/event.js';
export { MessageRepository } from './repositories/message.js';
export { QueuedMessageRepository } from './repositories/queued-message.js';
export { WorkspaceRepository } from './repositories/workspace.js';
export { WorktreeRepository } from './repositories/worktree.js';
export { SessionSearchIndexRepository } from './repositories/session-search-index.js';

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
  sessionSearch: SessionSearchIndexRepository;
  agentTasks: AgentTaskRepository;
  taskFollowUps: TaskFollowUpRepository;
  memories: AgentMemoryRepository;
  assistantMessages: AssistantMessageRepository;
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
    sessionSearch: new SessionSearchIndexRepository(db),
    agentTasks: new AgentTaskRepository(db),
    taskFollowUps: new TaskFollowUpRepository(db),
    memories: new AgentMemoryRepository(db),
    assistantMessages: new AssistantMessageRepository(db),
  };
}
