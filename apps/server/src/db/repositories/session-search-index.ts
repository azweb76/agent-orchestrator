import type Database from 'better-sqlite3';
import type { SessionSearchHit } from '@agent-orchestrator/shared';

export interface SessionSearchIndexRow {
  sessionId: string;
  agentId: string;
  title: string;
  firstPrompt: string;
  lastSummary: string;
  updatedAt: string;
}

export class SessionSearchIndexRepository {
  constructor(private db: Database.Database) {}

  upsert(row: SessionSearchIndexRow): void {
    this.db
      .prepare(
        `INSERT INTO session_search_index (
           session_id, agent_id, title, first_prompt, last_summary, updated_at
         ) VALUES (
           @sessionId, @agentId, @title, @firstPrompt, @lastSummary, @updatedAt
         )
         ON CONFLICT(session_id) DO UPDATE SET
           agent_id = excluded.agent_id,
           title = excluded.title,
           first_prompt = excluded.first_prompt,
           last_summary = excluded.last_summary,
           updated_at = excluded.updated_at`,
      )
      .run(row);
  }

  delete(sessionId: string): void {
    this.db.prepare('DELETE FROM session_search_index WHERE session_id = ?').run(sessionId);
  }

  deleteByAgent(agentId: string): void {
    this.db.prepare('DELETE FROM session_search_index WHERE agent_id = ?').run(agentId);
  }

  search(tokens: string[], limit: number): SessionSearchHit[] {
    if (tokens.length === 0) return [];

    const conditions = tokens
      .map(() => `lower(s.title || ' ' || s.first_prompt || ' ' || s.last_summary) LIKE ?`)
      .join(' AND ');
    const params = tokens.map((token) => `%${token}%`);

    const rows = this.db
      .prepare(
        `SELECT s.session_id AS sessionId, s.agent_id AS agentId, s.title, s.first_prompt AS firstPrompt,
                s.last_summary AS lastSummary, s.updated_at AS updatedAt,
                a.name AS agentName, w.name AS workspaceName
         FROM session_search_index s
         JOIN agents a ON a.id = s.agent_id
         JOIN worktrees wt ON wt.id = a.worktree_id
         JOIN workspaces w ON w.id = wt.workspace_id
         WHERE a.archived_at IS NULL
           AND ${conditions}
         ORDER BY s.updated_at DESC
         LIMIT ?`,
      )
      .all(...params, limit) as Array<{
      sessionId: string;
      agentId: string;
      title: string;
      firstPrompt: string;
      lastSummary: string;
      updatedAt: string;
      agentName: string;
      workspaceName: string;
    }>;

    return rows.map((row) => ({
      sessionId: row.sessionId,
      agentId: row.agentId,
      agentName: row.agentName,
      workspaceName: row.workspaceName,
      title: row.title,
      snippet: pickSnippet(row.firstPrompt, row.lastSummary),
      updatedAt: row.updatedAt,
    }));
  }
}

function pickSnippet(firstPrompt: string, lastSummary: string): string {
  const prompt = firstPrompt.trim();
  if (prompt) return prompt.length > 160 ? `${prompt.slice(0, 157)}…` : prompt;
  const summary = lastSummary.trim();
  if (summary) return summary.length > 160 ? `${summary.slice(0, 157)}…` : summary;
  return '';
}
