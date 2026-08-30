import type Database from 'better-sqlite3';
import type { ChatSession, SessionGrade } from '@agent-orchestrator/shared';
import { rowToChatSession } from '../row-mappers.js';

export class ChatSessionRepository {
  constructor(private db: Database.Database) {}

  create(session: ChatSession): ChatSession {
    this.db
      .prepare(
        `INSERT INTO chat_sessions (
           id, agent_id, title, template, status, model, effort, permission_mode,
           agent_task_id, system_prompt, allowed_tools,
           claude_session_id, pid, run_log_path, created_at, updated_at, title_source
         ) VALUES (
           @id, @agentId, @title, @template, @status, @model, @effort, @permissionMode,
           @agentTaskId, @systemPrompt, @allowedTools,
           @claudeSessionId, @pid, @runLogPath, @createdAt, @updatedAt, @titleSource
         )`,
      )
      .run({
        id: session.id,
        agentId: session.agentId,
        title: session.title,
        template: session.template,
        status: session.status,
        model: session.model,
        effort: session.effort,
        permissionMode: session.permissionMode,
        agentTaskId: session.agentTaskId ?? null,
        systemPrompt: session.systemPrompt ?? null,
        allowedTools: session.allowedTools ?? null,
        claudeSessionId: session.claudeSessionId,
        pid: session.pid,
        runLogPath: session.runLogPath,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        titleSource: session.titleSource ?? 'default',
      });
    return session;
  }

  getById(id: string): ChatSession | null {
    const row = this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id);
    return row ? rowToChatSession(row) : null;
  }

  listByAgent(agentId: string): ChatSession[] {
    return this.db
      .prepare('SELECT * FROM chat_sessions WHERE agent_id = ? ORDER BY created_at ASC')
      .all(agentId)
      .map(rowToChatSession);
  }

  listByAgentIds(agentIds: string[]): ChatSession[] {
    if (agentIds.length === 0) return [];
    const placeholders = agentIds.map(() => '?').join(',');
    return this.db
      .prepare(
        `SELECT * FROM chat_sessions WHERE agent_id IN (${placeholders}) ORDER BY created_at ASC`,
      )
      .all(...agentIds)
      .map(rowToChatSession);
  }

  listRunning(): ChatSession[] {
    return this.db
      .prepare(
        `SELECT * FROM chat_sessions
         WHERE status = 'running'
         ORDER BY updated_at ASC`,
      )
      .all()
      .map(rowToChatSession);
  }

  update(session: ChatSession): ChatSession {
    this.db
      .prepare(
        `UPDATE chat_sessions SET title = @title, template = @template, status = @status,
         model = @model, effort = @effort, permission_mode = @permissionMode,
         agent_task_id = @agentTaskId, system_prompt = @systemPrompt, allowed_tools = @allowedTools,
         claude_session_id = @claudeSessionId, pid = @pid, run_log_path = @runLogPath,
         updated_at = @updatedAt, title_source = @titleSource
         WHERE id = @id`,
      )
      .run({
        id: session.id,
        title: session.title,
        template: session.template,
        status: session.status,
        model: session.model,
        effort: session.effort,
        permissionMode: session.permissionMode,
        agentTaskId: session.agentTaskId ?? null,
        systemPrompt: session.systemPrompt ?? null,
        allowedTools: session.allowedTools ?? null,
        claudeSessionId: session.claudeSessionId,
        pid: session.pid,
        runLogPath: session.runLogPath,
        updatedAt: session.updatedAt,
        titleSource: session.titleSource ?? 'default',
      });
    return session;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
  }

  setGrade(sessionId: string, grade: SessionGrade, transcript: string): ChatSession {
    const result = this.db
      .prepare(
        `UPDATE chat_sessions
         SET grade_score = @score, grade_comment = @comment, grade_transcript = @transcript,
             grade_analysis = @analysis, graded_at = @gradedAt, updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: sessionId,
        score: grade.score,
        comment: grade.comment,
        transcript,
        analysis: grade.analysis ? JSON.stringify(grade.analysis) : null,
        gradedAt: grade.gradedAt,
        updatedAt: grade.gradedAt,
      });
    if (result.changes === 0) throw new Error('Session not found');
    const updated = this.getById(sessionId);
    if (!updated) throw new Error('Session not found');
    return updated;
  }

  clearGrade(sessionId: string): void {
    this.db
      .prepare(
        `UPDATE chat_sessions
         SET grade_score = NULL, grade_comment = NULL, grade_transcript = NULL,
             grade_analysis = NULL, graded_at = NULL
         WHERE id = ?`,
      )
      .run(sessionId);
  }

  getGradeTranscript(sessionId: string): string {
    const row = this.db
      .prepare('SELECT grade_transcript FROM chat_sessions WHERE id = ?')
      .get(sessionId) as { grade_transcript?: unknown } | undefined;
    return row?.grade_transcript == null ? '' : String(row.grade_transcript);
  }
}
