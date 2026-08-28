import type Database from 'better-sqlite3';

const AUTOMATION_KEY = 'automation';

export class AppSettingsRepository {
  constructor(private db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES (@key, @value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run({ key, value });
  }

  getAutomationJson(): string | null {
    return this.get(AUTOMATION_KEY);
  }

  setAutomationJson(value: string): void {
    this.set(AUTOMATION_KEY, value);
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  }
}
