const STORAGE_KEY = 'ao.work-queue-dismiss';
const SNOOZE_MS = 24 * 60 * 60 * 1000;

type DismissMap = Record<string, number>;

function readMap(): DismissMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: DismissMap = {};
    const now = Date.now();
    for (const [id, expires] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof expires === 'number' && expires > now) out[id] = expires;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: DismissMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

/** Ids currently snoozed (24h). */
export function readDismissedWorkItemIds(): Set<string> {
  return new Set(Object.keys(readMap()));
}

/** Snooze a work item for 24 hours (triage without starting an agent). */
export function dismissWorkItem(id: string): void {
  const map = readMap();
  map[id] = Date.now() + SNOOZE_MS;
  writeMap(map);
}
