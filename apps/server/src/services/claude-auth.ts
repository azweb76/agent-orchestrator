import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const CLAUDE_DOCS_URL = 'https://code.claude.com';
export const CLAUDE_LOGIN_HINT = 'Run `claude login` in a terminal to authenticate with Claude.';

export type ClaudeAuthStatus = {
  loggedIn: boolean;
  authMethod?: string;
  email?: string;
  subscriptionType?: string | null;
};

/** Probe Claude Code OAuth / login state via `claude auth status`. */
export async function checkClaudeAuth(claudeBin = 'claude'): Promise<ClaudeAuthStatus> {
  try {
    const { stdout } = await execFileAsync(claudeBin, ['auth', 'status'], {
      timeout: 15_000,
      env: process.env,
    });
    const parsed = JSON.parse(stdout) as {
      loggedIn?: boolean;
      authMethod?: string;
      email?: string;
      subscriptionType?: string | null;
    };
    return {
      loggedIn: Boolean(parsed.loggedIn),
      authMethod: parsed.authMethod,
      email: parsed.email,
      subscriptionType: parsed.subscriptionType ?? null,
    };
  } catch {
    return { loggedIn: false };
  }
}

export async function isClaudeAuthenticated(claudeBin = 'claude'): Promise<boolean> {
  const status = await checkClaudeAuth(claudeBin);
  return status.loggedIn;
}
