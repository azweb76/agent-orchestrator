import type Database from 'better-sqlite3';
import type { Workspace } from '@agent-orchestrator/shared';
import { rowToWorkspace } from '../row-mappers.js';

export class WorkspaceRepository {
  constructor(private db: Database.Database) {}

  create(workspace: Workspace): Workspace {
    this.db
      .prepare(
        `INSERT INTO workspaces (id, name, repo_url, repo_path, default_branch, github_owner, github_repo, created_at)
         VALUES (@id, @name, @repoUrl, @repoPath, @defaultBranch, @githubOwner, @githubRepo, @createdAt)`,
      )
      .run({
        id: workspace.id,
        name: workspace.name,
        repoUrl: workspace.repoUrl,
        repoPath: workspace.repoPath,
        defaultBranch: workspace.defaultBranch,
        githubOwner: workspace.githubOwner,
        githubRepo: workspace.githubRepo,
        createdAt: workspace.createdAt,
      });
    return workspace;
  }

  list(): Workspace[] {
    return this.db
      .prepare('SELECT * FROM workspaces ORDER BY created_at DESC')
      .all()
      .map(rowToWorkspace);
  }

  getById(id: string): Workspace | null {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    return row ? rowToWorkspace(row) : null;
  }

  getByOwnerRepo(owner: string, repo: string): Workspace | null {
    const row = this.db
      .prepare(
        `SELECT * FROM workspaces
         WHERE lower(github_owner) = lower(?) AND lower(github_repo) = lower(?)
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(owner, repo);
    return row ? rowToWorkspace(row) : null;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  }
}
