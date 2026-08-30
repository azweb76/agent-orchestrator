import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';

const execFileAsync = promisify(execFile);

/** Required for Messages API calls authenticated with a Claude.ai OAuth token. */
export const CLAUDE_OAUTH_BETA = 'oauth-2025-04-20';

interface ClaudeSettings {
  apiKeyHelper?: string;
  apiBaseUrl?: string;
}

interface ClaudeAiOauth {
  accessToken?: string;
  expiresAt?: number;
}

export type AnthropicAuth =
  | { mode: 'apiKey'; apiKey: string; baseUrl?: string }
  | { mode: 'authToken'; authToken: string; baseUrl?: string };

function isOauthAccessToken(value: string): boolean {
  return value.startsWith('sk-ant-oat01-');
}

function authFromSecret(secret: string, baseUrl?: string): AnthropicAuth | null {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  if (isOauthAccessToken(trimmed)) {
    return { mode: 'authToken', authToken: trimmed, baseUrl };
  }
  return { mode: 'apiKey', apiKey: trimmed, baseUrl };
}

async function readClaudeSettings(claudeDir: string): Promise<ClaudeSettings> {
  try {
    const raw = await fs.readFile(path.join(claudeDir, 'settings.json'), 'utf-8');
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    return {};
  }
}

async function readApiKeyFile(claudeDir: string): Promise<string | null> {
  try {
    return (await fs.readFile(path.join(claudeDir, '.api_key'), 'utf-8')).trim() || null;
  } catch {
    return null;
  }
}

async function runApiKeyHelper(command: string): Promise<string | null> {
  try {
    // Run via the user shell so helpers can use PATH / functions like Claude Code does.
    const { stdout } = await execFileAsync(process.env.SHELL || '/bin/sh', ['-lc', command], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function oauthFromPayload(payload: unknown): AnthropicAuth | null {
  if (!payload || typeof payload !== 'object') return null;
  const oauth = (payload as { claudeAiOauth?: ClaudeAiOauth }).claudeAiOauth;
  const token = oauth?.accessToken?.trim();
  if (!token) return null;
  if (typeof oauth?.expiresAt === 'number' && oauth.expiresAt <= Date.now()) {
    return null;
  }
  return { mode: 'authToken', authToken: token };
}

async function readCredentialsFile(claudeDir: string): Promise<AnthropicAuth | null> {
  try {
    const raw = await fs.readFile(path.join(claudeDir, '.credentials.json'), 'utf-8');
    return oauthFromPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readMacOsKeychainOauth(homeDir: string): Promise<AnthropicAuth | null> {
  if (process.platform !== 'darwin') return null;
  // Keychain is machine-global; only consult it for the real user home (not test temps).
  if (path.resolve(homeDir) !== path.resolve(os.homedir())) return null;
  try {
    const { stdout } = await execFileAsync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { timeout: 5_000, maxBuffer: 1024 * 1024 },
    );
    return oauthFromPayload(JSON.parse(stdout.trim()));
  } catch {
    return null;
  }
}

/**
 * Resolve Anthropic credentials the same way Claude Code prefers them:
 * env tokens/keys → settings apiKeyHelper → ~/.claude/.api_key → stored OAuth login.
 */
export async function resolveAnthropicAuth(
  homeDir: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<AnthropicAuth> {
  const claudeDir = path.join(homeDir, '.claude');
  const settings = await readClaudeSettings(claudeDir);
  const baseUrl = settings.apiBaseUrl || env.ANTHROPIC_BASE_URL || undefined;

  const fromAuthToken = authFromSecret(env.ANTHROPIC_AUTH_TOKEN ?? '', baseUrl);
  if (fromAuthToken) return fromAuthToken;

  const fromApiKey = authFromSecret(env.ANTHROPIC_API_KEY ?? '', baseUrl);
  if (fromApiKey) return fromApiKey;

  const fromClaudeOauthEnv = authFromSecret(env.CLAUDE_CODE_OAUTH_TOKEN ?? '', baseUrl);
  if (fromClaudeOauthEnv) return fromClaudeOauthEnv;

  if (settings.apiKeyHelper) {
    const helperOut = await runApiKeyHelper(settings.apiKeyHelper);
    const fromHelper = helperOut ? authFromSecret(helperOut, baseUrl) : null;
    if (fromHelper) return fromHelper;
  }

  const fileKey = await readApiKeyFile(claudeDir);
  const fromFile = fileKey ? authFromSecret(fileKey, baseUrl) : null;
  if (fromFile) return fromFile;

  const fromCredentialsFile = await readCredentialsFile(claudeDir);
  if (fromCredentialsFile) {
    return baseUrl ? { ...fromCredentialsFile, baseUrl } : fromCredentialsFile;
  }

  const fromKeychain = await readMacOsKeychainOauth(homeDir);
  if (fromKeychain) {
    return baseUrl ? { ...fromKeychain, baseUrl } : fromKeychain;
  }

  throw new Error(
    'Unable to resolve Anthropic credentials. Sign in with Claude Code (`claude auth login`), ' +
      `set ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN, configure "apiKeyHelper" in ${path.join(claudeDir, 'settings.json')}, ` +
      `or create ${path.join(claudeDir, '.api_key')}.`,
  );
}

export function createAnthropicClient(
  auth: AnthropicAuth,
  options: { timeout?: number } = {},
): Anthropic {
  const shared = {
    baseURL: auth.baseUrl || undefined,
    timeout: options.timeout,
  };

  if (auth.mode === 'apiKey') {
    return new Anthropic({ ...shared, apiKey: auth.apiKey });
  }

  return new Anthropic({
    ...shared,
    // Explicit null so a process-level ANTHROPIC_API_KEY cannot shadow OAuth.
    apiKey: null,
    authToken: auth.authToken,
    defaultHeaders: { 'anthropic-beta': CLAUDE_OAUTH_BETA },
  });
}
