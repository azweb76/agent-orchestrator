import type Database from 'better-sqlite3';
import type { Worktree } from '@agent-orchestrator/shared';
import { rowToWorktree } from '../row-mappers.js';

export class WorktreeRepository {
  constructor(private db: Database.Database) {}

  create(worktree: Worktree): Worktree {
    this.db
      .prepare(
        `INSERT INTO worktrees (id, workspace_id, name, path, branch, pr_number, pr_title, base_branch, created_at)
         VALUES (@id, @workspaceId, @name, @path, @branch, @prNumber, @prTitle, @baseBranch, @createdAt)`,
      )
      .run({
        id: worktree.id,
        workspaceId: worktree.workspaceId,
        name: worktree.name,
        path: worktree.path,
        branch: worktree.branch,
        prNumber: worktree.prNumber,
        prTitle: worktree.prTitle,
        baseBranch: worktree.baseBranch,
        createdAt: worktree.createdAt,
      });
    return worktree;
  }

  listByWorkspace(workspaceId: string): Worktree[] {
    return this.db
      .prepare('SELECT * FROM worktrees WHERE workspace_id = ? ORDER BY created_at DESC')
      .all(workspaceId)
      .map(rowToWorktree);
  }

  getById(id: string): Worktree | null {
    const row = this.db.prepare('SELECT * FROM worktrees WHERE id = ?').get(id);
    return row ? rowToWorktree(row) : null;
  }

  getByWorkspaceAndPr(workspaceId: string, prNumber: number): Worktree | null {
    const row = this.db
      .prepare(
        `SELECT * FROM worktrees
         WHERE workspace_id = ? AND pr_number = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(workspaceId, prNumber);
    return row ? rowToWorktree(row) : null;
  }

  update(worktree: Worktree): Worktree {
    this.db
      .prepare(
        `UPDATE worktrees SET name = @name, path = @path, branch = @branch,
         pr_number = @prNumber, pr_title = @prTitle, base_branch = @baseBranch
         WHERE id = @id`,
      )
      .run({
        id: worktree.id,
        name: worktree.name,
        path: worktree.path,
        branch: worktree.branch,
        prNumber: worktree.prNumber,
        prTitle: worktree.prTitle,
        baseBranch: worktree.baseBranch,
      });
    return worktree;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM worktrees WHERE id = ?').run(id);
  }
}
