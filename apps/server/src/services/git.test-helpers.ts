import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  ClaudeService,
  GitService,
  enrichPermissionInput,
  isPidAlive,
  killProcessTree,
  slugify,
} from './git.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function writeFakeClaude(binPath: string, script: string): Promise<void> {
  await fs.writeFile(binPath, script, { mode: 0o755 });
}

export async function waitFor(predicate: () => boolean, timeoutMs = 4000, pollMs = 40): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('timed out waiting for condition');
}

export const FAKE_CLAUDE_ASK_USER = `#!/usr/bin/env node
const readline = require('readline');
const session = 'sess-perm-1';
const rl = readline.createInterface({ input: process.stdin });
let gotPrompt = false;
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!gotPrompt && msg.type === 'user') {
    gotPrompt = true;
    process.stdout.write(JSON.stringify({ type: 'system', session_id: session }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'What should I do?' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'AskUserQuestion',
        input: {
          questions: [{
            question: 'Pick one',
            header: 'Q',
            options: [{ label: 'A', description: 'A' }],
          }],
        },
      },
    }) + '\\n');
    return;
  }
  if (msg.type === 'control_response') {
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: ' thanks' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'What should I do? thanks',
      session_id: session,
    }) + '\\n');
    process.exit(0);
  }
});
`;
export async function assertSamePath(actual: string | null, expected: string | null): Promise<void> {
  if (actual === null || expected === null) {
    assert.equal(actual, expected);
    return;
  }
  assert.equal(await fs.realpath(actual), await fs.realpath(expected));
}

export async function execGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function setupPrFetchFixture(): Promise<{
  tmp: string;
  origin: string;
  main: string;
  prCommit: string;
}> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-fetch-'));
  const origin = path.join(tmp, 'origin.git');
  const main = path.join(tmp, 'main');

  await execGit(tmp, ['init', '--bare', origin]);
  await execGit(tmp, ['clone', origin, main]);
  await execGit(main, ['config', 'user.email', 'test@example.com']);
  await execGit(main, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(main, 'README.md'), 'main\n');
  await execGit(main, ['add', 'README.md']);
  await execGit(main, ['commit', '-m', 'initial']);
  const current = await execGit(main, ['branch', '--show-current']);
  if (current !== 'main') {
    await execGit(main, ['branch', '-M', 'main']);
  }
  await execGit(main, ['push', '-u', 'origin', 'main']);
  // Common global config that used to delete refs/remotes/pull/*/head after fetch.
  await execGit(main, ['config', 'fetch.prune', 'true']);

  await execGit(main, ['checkout', '-b', 'pr-head']);
  await fs.writeFile(path.join(main, 'feature.txt'), 'pr change\n');
  await execGit(main, ['add', 'feature.txt']);
  await execGit(main, ['commit', '-m', 'pr commit']);
  const prCommit = await execGit(main, ['rev-parse', 'HEAD']);
  await execGit(main, ['push', 'origin', 'pr-head']);
  // Simulate GitHub's pull/N/head ref on the remote
  await execGit(origin, ['update-ref', 'refs/pull/33/head', prCommit]);
  await execGit(main, ['checkout', 'main']);

  return { tmp, origin, main, prCommit };
}
