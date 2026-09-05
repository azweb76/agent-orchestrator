import type Database from 'better-sqlite3';
import type { TaskFollowUp } from '@agent-orchestrator/shared';
import { rowToTaskFollowUp } from '../row-mappers.js';

export class TaskFollowUpRepository {
  constructor(private db: Database.Database) {}

  create(followUp: TaskFollowUp): TaskFollowUp {
    this.db
      .prepare(
        `INSERT INTO task_followups (
           id, name, title, description, prompt, kind, template,
           enabled, built_in, created_at, updated_at
         ) VALUES (
           @id, @name, @title, @description, @prompt, @kind, @template,
           @enabled, @builtIn, @createdAt, @updatedAt
         )`,
      )
      .run({
        id: followUp.id,
        name: followUp.name,
        title: followUp.title,
        description: followUp.description,
        prompt: followUp.prompt,
        kind: followUp.kind,
        template: followUp.template,
        enabled: followUp.enabled ? 1 : 0,
        builtIn: followUp.builtIn ? 1 : 0,
        createdAt: followUp.createdAt,
        updatedAt: followUp.updatedAt,
      });
    return followUp;
  }

  getById(id: string): TaskFollowUp | null {
    const row = this.db.prepare('SELECT * FROM task_followups WHERE id = ?').get(id);
    return row ? rowToTaskFollowUp(row) : null;
  }

  getByName(name: string): TaskFollowUp | null {
    const row = this.db.prepare('SELECT * FROM task_followups WHERE name = ?').get(name);
    return row ? rowToTaskFollowUp(row) : null;
  }

  list(): TaskFollowUp[] {
    return this.db
      .prepare('SELECT * FROM task_followups ORDER BY built_in DESC, title ASC')
      .all()
      .map(rowToTaskFollowUp);
  }

  listEnabled(): TaskFollowUp[] {
    return this.db
      .prepare(
        `SELECT * FROM task_followups WHERE enabled = 1 ORDER BY built_in DESC, title ASC`,
      )
      .all()
      .map(rowToTaskFollowUp);
  }

  update(followUp: TaskFollowUp): TaskFollowUp {
    this.db
      .prepare(
        `UPDATE task_followups SET
           name = @name, title = @title, description = @description, prompt = @prompt,
           kind = @kind, template = @template, enabled = @enabled, built_in = @builtIn,
           updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: followUp.id,
        name: followUp.name,
        title: followUp.title,
        description: followUp.description,
        prompt: followUp.prompt,
        kind: followUp.kind,
        template: followUp.template,
        enabled: followUp.enabled ? 1 : 0,
        builtIn: followUp.builtIn ? 1 : 0,
        updatedAt: followUp.updatedAt,
      });
    return followUp;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM task_followups WHERE id = ?').run(id);
  }
}
