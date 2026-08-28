import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AppContext } from './app.js';
import { GitHubService } from './github.js';
import { invalidateStatusCache } from './status-cache.js';

const execFileAsync = promisify(execFile);

const SECRETS_DIR = '.secrets';
const GITHUB_TOKEN_FILE = 'github_token';
const CLAUDE_BIN_FILE = 'claude_bin';

export const SETUP_DOCS_URL = 'https://github.com/azweb76/agent-orchestrator#setup';
export const CLAUDE_DOCS_URL = 'https://code.claude.com';

function secretsDir(dataDir: string): string {
  return path.join(dataDir, SECRETS_DIR);
}

/** Load persisted secrets into process env on startup (sync-friendly). */
export function applyPersistedSecrets(dataDir: string): { claudeBin?: string } {
  const result: { claudeBin?: string } = {};
  const tokenPath = path.join(secretsDir(dataDir), GITHUB_TOKEN_FILE);
  const binPath = path.join(secretsDir(dataDir), CLAUDE_BIN_FILE);
  try {
    if (!process.env.GITHUB_TOKEN && existsSync(tokenPath)) {
      const token = readFileSync(tokenPath, 'utf8').trim();
      if (token) process.env.GITHUB_TOKEN = token;
    }
    if (existsSync(binPath)) {
      const bin = readFileSync(binPath, 'utf8').trim();
      if (bin) {
        process.env.CLAUDE_BIN = bin;
        result.claudeBin = bin;
      }
    }
  } catch {
    // ignore unreadable secrets
  }
  return result;
}

async function writeSecret(dataDir: string, name: string, value: string): Promise<void> {
  const dir = secretsDir(dataDir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(dir, name), value, { mode: 0o600 });
}

export async function detectClaudeCandidates(currentBin: string): Promise<string[]> {
  const raw = new Set<string>();
  if (currentBin.trim()) raw.add(currentBin.trim());
  raw.add('claude');
  try {
    const { stdout } = await execFileAsync('which', ['claude']);
    const found = stdout.trim();
    if (found) raw.add(found);
  } catch {
    // not on PATH
  }

  const verified: string[] = [];
  for (const bin of raw) {
    try {
      await execFileAsync(bin, ['--version']);
      verified.push(bin);
    } catch {
      // skip invalid candidates
    }
  }
  return verified;
}

export async function configureGithubToken(
  ctx: AppContext,
  token: string,
): Promise<{ githubLogin: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('GitHub token is required');

  const probe = new GitHubService({ token: trimmed });
  const githubLogin = await probe.getAuthenticatedLogin();

  await writeSecret(ctx.dataDir, GITHUB_TOKEN_FILE, trimmed);
  process.env.GITHUB_TOKEN = trimmed;
  ctx.github.setToken(trimmed);
  invalidateStatusCache();

  return { githubLogin };
}

export async function configureClaudeBin(ctx: AppContext, claudeBin: string): Promise<void> {
  const trimmed = claudeBin.trim();
  if (!trimmed) throw new Error('Claude binary path is required');

  try {
    await execFileAsync(trimmed, ['--version']);
  } catch {
    throw new Error(`Claude binary not found or not executable: ${trimmed}`);
  }

  await writeSecret(ctx.dataDir, CLAUDE_BIN_FILE, trimmed);
  process.env.CLAUDE_BIN = trimmed;
  ctx.claude.setBin(trimmed);
  invalidateStatusCache();
}
