import type { ClaudeService } from './git.js';
import { isClaudeAuthenticated } from './claude-auth.js';

const CLAUDE_TTL_MS = 60_000;
const AUTH_TTL_MS = 60_000;

let claudeInstalledCache: { value: boolean; expiresAt: number } | null = null;
let claudeAuthCache: { value: boolean; expiresAt: number } | null = null;

/** Drop cached readiness values (e.g. after Claude bin changes). */
export function invalidateStatusCache(): void {
  claudeInstalledCache = null;
  claudeAuthCache = null;
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

/** True when Claude Code OAuth/login is available for the Agent SDK. */
export async function cachedAnthropicConfigured(claudeBin = 'claude'): Promise<boolean> {
  const now = Date.now();
  if (claudeAuthCache && claudeAuthCache.expiresAt > now) {
    return claudeAuthCache.value;
  }
  const value = await isClaudeAuthenticated(claudeBin);
  claudeAuthCache = { value, expiresAt: now + AUTH_TTL_MS };
  return value;
}
