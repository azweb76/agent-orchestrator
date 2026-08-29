import type { ClaudeService } from './git.js';

const CLAUDE_TTL_MS = 60_000;

let claudeInstalledCache: { value: boolean; expiresAt: number } | null = null;

/** Drop cached readiness values (e.g. after Claude bin changes). */
export function invalidateStatusCache(): void {
  claudeInstalledCache = null;
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
