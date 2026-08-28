import type { ClaudeService } from './git.js';

const CLAUDE_TTL_MS = 60_000;
const DATA_DIR_TTL_MS = 120_000;

let claudeInstalledCache: { value: boolean; expiresAt: number } | null = null;
let dataDirBytesCache: { value: number; expiresAt: number } | null = null;

/** Drop cached readiness values (e.g. after archive/prune changes disk usage). */
export function invalidateStatusCache(): void {
  claudeInstalledCache = null;
  dataDirBytesCache = null;
}

export async function cachedClaudeInstalled(claude: ClaudeService): Promise<boolean> {
  const now = Date.now();
  if (claudeInstalledCache && claudeInstalledCache.expiresAt > now) {
    return claudeInstalledCache.value;
  }
  const value = await claude.checkInstalled();
  claudeInstalledCache = { value, expiresAt: now + CLAUDE_TTL_MS };
  return value;
}

export async function cachedDataDirBytes(
  dataDir: string,
  compute: (root: string) => Promise<number>,
): Promise<number> {
  const now = Date.now();
  if (dataDirBytesCache && dataDirBytesCache.expiresAt > now) {
    return dataDirBytesCache.value;
  }
  const value = await compute(dataDir);
  dataDirBytesCache = { value, expiresAt: now + DATA_DIR_TTL_MS };
  return value;
}
