import type Database from 'better-sqlite3';

export class AutomationStateRepository {
  constructor(private db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM automation_state WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO automation_state (key, value) VALUES (@key, @value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run({ key, value });
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM automation_state WHERE key = ?').run(key);
  }

  getNumber(key: string): number {
    const raw = this.get(key);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  increment(key: string): number {
    const next = this.getNumber(key) + 1;
    this.set(key, String(next));
    return next;
  }

  getJsonSet(key: string): Set<string> {
    const raw = this.get(key);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((item): item is string => typeof item === 'string'));
    } catch {
      return new Set();
    }
  }

  setJsonSet(key: string, values: Set<string>): void {
    this.set(key, JSON.stringify([...values]));
  }
}
