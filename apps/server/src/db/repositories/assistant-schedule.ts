import type Database from 'better-sqlite3';
import type {
  AssistantRun,
  AssistantSchedule,
  AssistantSchedulePolicy,
  AssistantScheduleStatus,
  AssistantRunStatus,
  AssistantSchedulePlaybook,
} from '@agent-orchestrator/shared';

function rowToSchedule(row: Record<string, unknown>): AssistantSchedule {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    cron: String(row.cron),
    timezone: String(row.timezone ?? 'UTC'),
    policy: row.policy as AssistantSchedulePolicy,
    playbook: row.playbook as AssistantSchedulePlaybook,
    prompt: row.prompt == null ? null : String(row.prompt),
    status: row.status as AssistantScheduleStatus,
    nextRunAt: row.next_run_at == null ? null : String(row.next_run_at),
    lastRunAt: row.last_run_at == null ? null : String(row.last_run_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToRun(row: Record<string, unknown>): AssistantRun {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    status: row.status as AssistantRunStatus,
    policy: row.policy as AssistantSchedulePolicy,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at == null ? null : String(row.finished_at),
    summary: row.summary == null ? null : String(row.summary),
    error: row.error == null ? null : String(row.error),
    toolCallsJson: String(row.tool_calls_json ?? '[]'),
  };
}

export class AssistantScheduleRepository {
  constructor(private db: Database.Database) {}

  create(schedule: AssistantSchedule): AssistantSchedule {
    this.db
      .prepare(
        `INSERT INTO assistant_schedules (
           id, name, description, cron, timezone, policy, playbook, prompt,
           status, next_run_at, last_run_at, created_at, updated_at
         ) VALUES (
           @id, @name, @description, @cron, @timezone, @policy, @playbook, @prompt,
           @status, @nextRunAt, @lastRunAt, @createdAt, @updatedAt
         )`,
      )
      .run({
        id: schedule.id,
        name: schedule.name,
        description: schedule.description,
        cron: schedule.cron,
        timezone: schedule.timezone,
        policy: schedule.policy,
        playbook: schedule.playbook,
        prompt: schedule.prompt,
        status: schedule.status,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: schedule.lastRunAt,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt,
      });
    return schedule;
  }

  getById(id: string): AssistantSchedule | null {
    const row = this.db.prepare('SELECT * FROM assistant_schedules WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSchedule(row) : null;
  }

  update(schedule: AssistantSchedule): AssistantSchedule {
    this.db
      .prepare(
        `UPDATE assistant_schedules SET
           name = @name,
           description = @description,
           cron = @cron,
           timezone = @timezone,
           policy = @policy,
           playbook = @playbook,
           prompt = @prompt,
           status = @status,
           next_run_at = @nextRunAt,
           last_run_at = @lastRunAt,
           updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: schedule.id,
        name: schedule.name,
        description: schedule.description,
        cron: schedule.cron,
        timezone: schedule.timezone,
        policy: schedule.policy,
        playbook: schedule.playbook,
        prompt: schedule.prompt,
        status: schedule.status,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: schedule.lastRunAt,
        updatedAt: schedule.updatedAt,
      });
    return schedule;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM assistant_schedules WHERE id = ?').run(id);
  }

  list(includePaused = true): AssistantSchedule[] {
    const rows = (
      includePaused
        ? this.db.prepare(
            `SELECT * FROM assistant_schedules
             ORDER BY created_at ASC, rowid ASC`,
          )
        : this.db.prepare(
            `SELECT * FROM assistant_schedules
             WHERE status = 'active'
             ORDER BY created_at ASC, rowid ASC`,
          )
    ).all() as Array<Record<string, unknown>>;
    return rows.map(rowToSchedule);
  }

  listDue(nowIso: string): AssistantSchedule[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM assistant_schedules
         WHERE status = 'active'
           AND next_run_at IS NOT NULL
           AND next_run_at <= ?
         ORDER BY next_run_at ASC`,
      )
      .all(nowIso) as Array<Record<string, unknown>>;
    return rows.map(rowToSchedule);
  }
}

export class AssistantRunRepository {
  constructor(private db: Database.Database) {}

  create(run: AssistantRun): AssistantRun {
    this.db
      .prepare(
        `INSERT INTO assistant_runs (
           id, schedule_id, status, policy, started_at, finished_at, summary, error, tool_calls_json
         ) VALUES (
           @id, @scheduleId, @status, @policy, @startedAt, @finishedAt, @summary, @error, @toolCallsJson
         )`,
      )
      .run({
        id: run.id,
        scheduleId: run.scheduleId,
        status: run.status,
        policy: run.policy,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        summary: run.summary,
        error: run.error,
        toolCallsJson: run.toolCallsJson,
      });
    return run;
  }

  update(run: AssistantRun): AssistantRun {
    this.db
      .prepare(
        `UPDATE assistant_runs SET
           status = @status,
           finished_at = @finishedAt,
           summary = @summary,
           error = @error,
           tool_calls_json = @toolCallsJson
         WHERE id = @id`,
      )
      .run({
        id: run.id,
        status: run.status,
        finishedAt: run.finishedAt,
        summary: run.summary,
        error: run.error,
        toolCallsJson: run.toolCallsJson,
      });
    return run;
  }

  list(params: { scheduleId?: string; limit?: number } = {}): AssistantRun[] {
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const rows = (
      params.scheduleId
        ? this.db
            .prepare(
              `SELECT * FROM assistant_runs
               WHERE schedule_id = ?
               ORDER BY started_at DESC, rowid DESC
               LIMIT ?`,
            )
            .all(params.scheduleId, limit)
        : this.db
            .prepare(
              `SELECT * FROM assistant_runs
               ORDER BY started_at DESC, rowid DESC
               LIMIT ?`,
            )
            .all(limit)
    ) as Array<Record<string, unknown>>;
    return rows.map(rowToRun);
  }
}
