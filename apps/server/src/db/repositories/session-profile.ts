import type Database from 'better-sqlite3';
import type { SessionProfile } from '@agent-orchestrator/shared';
import { rowToSessionProfile } from '../row-mappers.js';

export class SessionProfileRepository {
  constructor(private db: Database.Database) {}

  create(profile: SessionProfile): SessionProfile {
    this.db
      .prepare(
        `INSERT INTO session_profiles (
           id, name, title, description, prompt_template, system_prompt, allowed_tools,
           model, effort, permission_mode, listed, built_in, created_at, updated_at
         ) VALUES (
           @id, @name, @title, @description, @promptTemplate, @systemPrompt, @allowedTools,
           @model, @effort, @permissionMode, @listed, @builtIn, @createdAt, @updatedAt
         )`,
      )
      .run({
        id: profile.id,
        name: profile.name,
        title: profile.title,
        description: profile.description,
        promptTemplate: profile.promptTemplate,
        systemPrompt: profile.systemPrompt,
        allowedTools: profile.allowedTools,
        model: profile.model,
        effort: profile.effort,
        permissionMode: profile.permissionMode,
        listed: profile.listed ? 1 : 0,
        builtIn: profile.builtIn ? 1 : 0,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      });
    return profile;
  }

  getById(id: string): SessionProfile | null {
    const row = this.db.prepare('SELECT * FROM session_profiles WHERE id = ?').get(id);
    return row ? rowToSessionProfile(row) : null;
  }

  getByName(name: string): SessionProfile | null {
    const row = this.db.prepare('SELECT * FROM session_profiles WHERE name = ?').get(name);
    return row ? rowToSessionProfile(row) : null;
  }

  list(): SessionProfile[] {
    return this.db
      .prepare('SELECT * FROM session_profiles ORDER BY built_in DESC, title ASC')
      .all()
      .map(rowToSessionProfile);
  }

  listListed(): SessionProfile[] {
    return this.db
      .prepare(
        `SELECT * FROM session_profiles WHERE listed = 1 ORDER BY title ASC`,
      )
      .all()
      .map(rowToSessionProfile);
  }

  update(profile: SessionProfile): SessionProfile {
    this.db
      .prepare(
        `UPDATE session_profiles SET
           name = @name, title = @title, description = @description,
           prompt_template = @promptTemplate, system_prompt = @systemPrompt,
           allowed_tools = @allowedTools, model = @model, effort = @effort,
           permission_mode = @permissionMode, listed = @listed, built_in = @builtIn,
           updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: profile.id,
        name: profile.name,
        title: profile.title,
        description: profile.description,
        promptTemplate: profile.promptTemplate,
        systemPrompt: profile.systemPrompt,
        allowedTools: profile.allowedTools,
        model: profile.model,
        effort: profile.effort,
        permissionMode: profile.permissionMode,
        listed: profile.listed ? 1 : 0,
        builtIn: profile.builtIn ? 1 : 0,
        updatedAt: profile.updatedAt,
      });
    return profile;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM session_profiles WHERE id = ?').run(id);
  }
}
