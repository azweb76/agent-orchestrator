import { execFileSync } from 'node:child_process';
import os from 'node:os';

const JIRA_KEYCHAIN_SERVICE = 'jira-api-token';

/**
 * Read the Jira API token from the macOS keychain.
 * Equivalent to: `security find-generic-password -a "$USER" -s jira-api-token -w`
 */
export function readJiraApiTokenFromKeychain(
  account: string = process.env.USER?.trim() || os.userInfo().username,
): string | null {
  if (process.platform !== 'darwin') return null;
  const trimmedAccount = account.trim();
  if (!trimmedAccount) return null;
  try {
    const stdout = execFileSync(
      'security',
      ['find-generic-password', '-a', trimmedAccount, '-s', JIRA_KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Prefer `JIRA_API_TOKEN`, then the macOS keychain item `jira-api-token` for `$USER`. */
export function resolveJiraApiToken(
  env: NodeJS.ProcessEnv = process.env,
  readKeychain: () => string | null = readJiraApiTokenFromKeychain,
): string | undefined {
  const fromEnv = env.JIRA_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return readKeychain() ?? undefined;
}
