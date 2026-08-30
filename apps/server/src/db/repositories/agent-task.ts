import type Database from 'better-sqlite3';
import type { AgentTask } from '@agent-orchestrator/shared';
import { rowToAgentTask } from '../row-mappers.js';

export class AgentTaskRepository {
  constructor(private db: Database.Database) {}

  create(task: AgentTask): AgentTask {
    this.db
      .prepare(
        `INSERT INTO agent_tasks (
           id, name, title, description, purpose, prompt_template, system_prompt, allowed_tools,
           model, effort, permission_mode, listed, built_in, created_at, updated_at
         ) VALUES (
           @id, @name, @title, @description, @purpose, @promptTemplate, @systemPrompt, @allowedTools,
           @model, @effort, @permissionMode, @listed, @builtIn, @createdAt, @updatedAt
         )`,
      )
      .run({
        id: task.id,
        name: task.name,
        title: task.title,
        description: task.description,
        purpose: task.purpose,
        promptTemplate: task.promptTemplate,
        systemPrompt: task.systemPrompt,
        allowedTools: task.allowedTools,
        model: task.model,
        effort: task.effort,
        permissionMode: task.permissionMode,
        listed: task.listed ? 1 : 0,
        builtIn: task.builtIn ? 1 : 0,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    return task;
  }

  getById(id: string): AgentTask | null {
    const row = this.db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(id);
    return row ? rowToAgentTask(row) : null;
  }

  getByName(name: string): AgentTask | null {
    const row = this.db.prepare('SELECT * FROM agent_tasks WHERE name = ?').get(name);
    return row ? rowToAgentTask(row) : null;
  }

  list(): AgentTask[] {
    return this.db
      .prepare('SELECT * FROM agent_tasks ORDER BY built_in DESC, title ASC')
      .all()
      .map(rowToAgentTask);
  }

  listListed(): AgentTask[] {
    return this.db
      .prepare(`SELECT * FROM agent_tasks WHERE listed = 1 ORDER BY title ASC`)
      .all()
      .map(rowToAgentTask);
  }

  update(task: AgentTask): AgentTask {
    this.db
      .prepare(
        `UPDATE agent_tasks SET
           name = @name, title = @title, description = @description, purpose = @purpose,
           prompt_template = @promptTemplate, system_prompt = @systemPrompt,
           allowed_tools = @allowedTools, model = @model, effort = @effort,
           permission_mode = @permissionMode, listed = @listed, built_in = @builtIn,
           updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: task.id,
        name: task.name,
        title: task.title,
        description: task.description,
        purpose: task.purpose,
        promptTemplate: task.promptTemplate,
        systemPrompt: task.systemPrompt,
        allowedTools: task.allowedTools,
        model: task.model,
        effort: task.effort,
        permissionMode: task.permissionMode,
        listed: task.listed ? 1 : 0,
        builtIn: task.builtIn ? 1 : 0,
        updatedAt: task.updatedAt,
      });
    return task;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM agent_tasks WHERE id = ?').run(id);
  }
}
